import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import type { PropertyData, PropertyCategory } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { randomIfcVisualizationState } from "./RandomIfcVisualization";

const TARGET_IFC_GUID = "0GYqmJBIb6LPFuePZ9lxOc";
const IFC_CATEGORY_LABEL = "IFC";
const TARGET_IFC_GUID_PROPERTY = "IFCGUID";
const RANDOM_PROPERTY_NAME = "Random";
const RANDOM_PROPERTY_LABEL = "Random";
const RANDOM_CATEGORY_NAME = "__ifc_random__";
const RANDOM_SOURCE_URL = "/api/csrng?min=0&max=100";

type RandomApiResponse = { random?: number } | Array<{ random?: number }>;

export class MechanicalEquipmentRandomPropertyDataProvider extends PresentationPropertyDataProvider {
  private _randomValue = "Loading...";
  private _refreshTimer?: number;
  private _disposed = false;

  public constructor(imodel: IModelConnection) {
    super({ imodel });

    this._refreshTimer = window.setInterval(() => {
      void this.refreshRandomValue();
    }, 1000);

    void this.refreshRandomValue();
  }

  public override dispose(): void {
    this._disposed = true;

    if (this._refreshTimer !== undefined) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }

    super.dispose();
  }

  public override async getData(): Promise<PropertyData> {
    const data = await super.getData();
    return this.withRandomProperty(data);
  }

  private async refreshRandomValue() {
    try {
      const response = await fetch(RANDOM_SOURCE_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Random API request failed with ${response.status}`);
      }

      const payload = (await response.json()) as RandomApiResponse;
      const nextValue = Array.isArray(payload) ? payload[0]?.random : payload.random;
      if (typeof nextValue !== "number" || this._disposed) {
        return;
      }

      this._randomValue = String(nextValue);
      randomIfcVisualizationState.setRandomValue(nextValue);
      this.onDataChanged.raiseEvent();
    } catch {
      if (this._disposed || this._randomValue === "Unavailable") {
        return;
      }

      this._randomValue = "Unavailable";
      this.onDataChanged.raiseEvent();
    }
  }

  private withRandomProperty(data: PropertyData): PropertyData {
    if (!hasTargetIfcGuid(data.records)) {
      return data;
    }

    const matchingCategoryNames = collectIfcCategoryNames(data.categories);
    const elementIds = getCurrentElementIds(this);
    if (elementIds.length > 0) {
      randomIfcVisualizationState.setElementIds(elementIds);
    }

    const categories = [...data.categories];
    if (matchingCategoryNames.size === 0) {
      categories.push({
        name: RANDOM_CATEGORY_NAME,
        label: IFC_CATEGORY_LABEL,
        expand: true,
      });
      matchingCategoryNames.add(RANDOM_CATEGORY_NAME);
    }

    const randomRecord = PropertyRecord.fromString(this._randomValue, {
      name: RANDOM_PROPERTY_NAME,
      displayLabel: RANDOM_PROPERTY_LABEL,
      typename: "string",
    });

    const records = { ...data.records };
    for (const categoryName of matchingCategoryNames) {
      const existingRecords = records[categoryName] ?? [];
      records[categoryName] = [
        ...existingRecords.filter((record) => record.property.name !== RANDOM_PROPERTY_NAME),
        randomRecord,
      ];
    }

    return {
      ...data,
      categories,
      records,
    };
  }
}

export const createMechanicalEquipmentRandomPropertyDataProvider = (imodel: IModelConnection) =>
  new MechanicalEquipmentRandomPropertyDataProvider(imodel);

function collectIfcCategoryNames(categories: PropertyCategory[]): Set<string> {
  const matchingCategoryNames = new Set<string>();

  for (const category of categories) {
    if (matchesIfcCategory(category.label) || matchesIfcCategory(category.name)) {
      matchingCategoryNames.add(category.name);
    }

    if (category.childCategories) {
      for (const childName of collectIfcCategoryNames(category.childCategories)) {
        matchingCategoryNames.add(childName);
      }
    }
  }

  return matchingCategoryNames;
}

function hasTargetIfcGuid(recordsByCategory: PropertyData["records"]): boolean {
  return Object.values(recordsByCategory).some((records) =>
    records.some((record) => {
      const propertyName = record.property.name.toUpperCase();
      const propertyLabel = record.property.displayLabel.toUpperCase();
      if (propertyName !== TARGET_IFC_GUID_PROPERTY && propertyLabel !== TARGET_IFC_GUID_PROPERTY) {
        return false;
      }

      return getPrimitiveDisplayValue(record) === TARGET_IFC_GUID;
    }),
  );
}

function getPrimitiveDisplayValue(record: PropertyRecord): string | undefined {
  if (record.value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }

  const value = record.value.displayValue ?? record.value.value;
  return value === undefined || value === null ? undefined : String(value);
}

function matchesIfcCategory(value: string | undefined): boolean {
  return value?.toUpperCase().includes(IFC_CATEGORY_LABEL) ?? false;
}

function getCurrentElementIds(dataProvider: PresentationPropertyDataProvider): string[] {
  const elementIds: string[] = [];
  for (const instanceIds of dataProvider.keys.instanceKeys.values()) {
    for (const instanceId of instanceIds) {
      elementIds.push(instanceId);
    }
  }

  return elementIds.length === 1 ? elementIds : [];
}
