import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import type { PropertyData, PropertyCategory } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import type { IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { createSelectionScopeProps, Presentation } from "@itwin/presentation-frontend";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { randomIfcVisualizationState } from "./RandomIfcVisualization";

const TARGET_IFC_GUID = "0GYqmJBIb6LPFuePZ9lxOc";
const IFC_CATEGORY_LABEL = "IFC";
const TARGET_IFC_GUID_PROPERTY = "IFCGUID";
const RANDOM_PROPERTY_NAME = "Random";
const RANDOM_PROPERTY_LABEL = "Random";
const RANDOM_CATEGORY_NAME = "__ifc_random__";
const RANDOM_SOURCE_URL = "/api/csrng?min=0&max=100";
const TARGET_IFC_GUID_PROPERTY_QUERY_NAME = "IFCGUID";
export const TARGET_ELEMENT_ID64 = "0x20000000a76";

type RandomApiResponse = { random?: number } | Array<{ random?: number }>;
export interface RandomValueQueryLogEntry {
  id: number;
  queriedAtUtc: string;
}

interface IfcGuidClass {
  schemaName: string;
  className: string;
  propertyName: string;
}

class RandomValueQueryLogState {
  private _entries: RandomValueQueryLogEntry[] = [];
  private _nextId = 1;

  public readonly onChanged = new BeEvent<() => void>();

  public get entries(): RandomValueQueryLogEntry[] {
    return this._entries;
  }

  public addEntry(queriedAtUtc: string): void {
    this._entries = [
      {
        id: this._nextId,
        queriedAtUtc,
      },
      ...this._entries,
    ].slice(0, 10000);
    this._nextId += 1;
    this.onChanged.raiseEvent();
  }
}

export const randomValueQueryLogState = new RandomValueQueryLogState();

let startupSelectionTimer: number | undefined;
let startupSelectionInFlight = false;
let startupSelectionComplete = false;
let startupRandomRefreshTimer: number | undefined;

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
      const nextValue = await fetchRandomValue();
      if (this._disposed) {
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

export async function initializeMechanicalEquipmentRandomEntity(imodel: IModelConnection, viewport?: ScreenViewport): Promise<void> {
  startStartupSelection(imodel, viewport);
  startStartupRandomRefresh();
}

function startStartupSelection(imodel: IModelConnection, viewport?: ScreenViewport): void {
  if (startupSelectionTimer !== undefined || startupSelectionComplete) {
    return;
  }

  void selectStartupElement(imodel, viewport);
  startupSelectionTimer = window.setInterval(() => {
    void selectStartupElement(imodel, viewport);
  }, 5000);
}

async function selectStartupElement(imodel: IModelConnection, viewport?: ScreenViewport): Promise<void> {
  if (startupSelectionInFlight || imodel.isClosed || startupSelectionComplete) {
    stopStartupSelection();
    return;
  }

  startupSelectionInFlight = true;
  try {
    const elementIds = await queryElementIdsByIfcGuid(imodel, TARGET_IFC_GUID);
    const idsToSelect = elementIds.length > 0 ? elementIds : [TARGET_ELEMENT_ID64];
    if (idsToSelect.length > 0) {
      imodel.selectionSet.add(idsToSelect);
      randomIfcVisualizationState.setElementIds(idsToSelect);
      if (viewport !== undefined) {
        try {
          await viewport.zoomToElements(idsToSelect, {
            animateFrustumChange: true,
            paddingPercent: 0.35,
            minimumDimension: 2,
          });
        } catch (error) {
          console.warn(`Unable to zoom to IFCGUID ${TARGET_IFC_GUID}.`, error);
        }
      }

      try {
        await Presentation.selection.replaceSelectionWithScope(
          "Startup IFCGUID selection",
          imodel,
          idsToSelect,
          createSelectionScopeProps(Presentation.selection.scopes.activeScope),
        );
      } catch (error) {
        console.warn(`Unable to update presentation selection for IFCGUID ${TARGET_IFC_GUID}.`, error);
        return;
      }

      startupSelectionComplete = true;
      stopStartupSelection();
    }
  } catch (error) {
    console.warn(`Unable to locate IFCGUID ${TARGET_IFC_GUID} on startup.`, error);
  } finally {
    startupSelectionInFlight = false;
  }
}

function stopStartupSelection(): void {
  if (startupSelectionTimer === undefined) {
    return;
  }

  window.clearInterval(startupSelectionTimer);
  startupSelectionTimer = undefined;
}

function startStartupRandomRefresh(): void {
  if (startupRandomRefreshTimer !== undefined) {
    return;
  }

  void refreshStartupRandomValue();
  startupRandomRefreshTimer = window.setInterval(() => {
    void refreshStartupRandomValue();
  }, 1000);
}

async function refreshStartupRandomValue(): Promise<void> {
  try {
    randomIfcVisualizationState.setRandomValue(await fetchRandomValue());
  } catch (error) {
    console.warn("Unable to fetch startup random value.", error);
  }
}

async function fetchRandomValue(): Promise<number> {
  randomValueQueryLogState.addEntry(new Date().toISOString());

  const response = await fetch(RANDOM_SOURCE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Random API request failed with ${response.status}`);
  }

  const payload = (await response.json()) as RandomApiResponse;
  const nextValue = Array.isArray(payload) ? payload[0]?.random : payload.random;
  if (typeof nextValue !== "number") {
    throw new Error("Random API response did not include a numeric random value");
  }

  return nextValue;
}

async function queryElementIdsByIfcGuid(imodel: IModelConnection, ifcGuid: string): Promise<string[]> {
  if (imodel.isClosed) {
    return [];
  }

  const elementIdsFromExternalSourceAspect = await queryExternalSourceAspectElementIdsByIfcGuid(imodel, ifcGuid);
  if (elementIdsFromExternalSourceAspect.length > 0) {
    return elementIdsFromExternalSourceAspect;
  }

  const elementIdsFromElement = await queryClassElementIdsByIfcGuid(
    imodel,
    "BisCore",
    "Element",
    TARGET_IFC_GUID_PROPERTY_QUERY_NAME,
    ifcGuid,
  );
  if (elementIdsFromElement.length > 0) {
    return elementIdsFromElement;
  }

  const classes = await queryClassesWithIfcGuidProperty(imodel);
  for (const { schemaName, className, propertyName } of classes) {
    const elementIds = await queryClassElementIdsByIfcGuid(imodel, schemaName, className, propertyName, ifcGuid);
    if (elementIds.length > 0) {
      return elementIds;
    }
  }

  return [];
}

async function queryExternalSourceAspectElementIdsByIfcGuid(imodel: IModelConnection, ifcGuid: string): Promise<string[]> {
  const elementIds: string[] = [];
  const query = `
    SELECT Element.Id id
    FROM BisCore.ExternalSourceAspect
    WHERE Identifier = :ifcGuid
  `;
  let reader;
  try {
    reader = imodel.createQueryReader(
      query,
      QueryBinder.from({ ifcGuid }),
      { rowFormat: QueryRowFormat.UseJsPropertyNames },
    );
  } catch {
    return [];
  }

  try {
    for await (const row of reader) {
      const elementId = getQueryId(row.id);
      if (elementId !== undefined) {
        elementIds.push(elementId);
      }
    }
  } catch {
    return [];
  }

  return elementIds.length === 1 ? elementIds : [];
}

async function queryClassesWithIfcGuidProperty(imodel: IModelConnection): Promise<IfcGuidClass[]> {
  const classes: IfcGuidClass[] = [];
  const query = `
    SELECT s.Name schemaName, c.Name className, p.Name propertyName
    FROM meta.ECPropertyDef p
    JOIN meta.ECClassDef c ON p.Class.Id = c.ECInstanceId
    JOIN meta.ECSchemaDef s ON c.Schema.Id = s.ECInstanceId
    WHERE UPPER(p.Name) = :propertyName
  `;
  const reader = imodel.createQueryReader(
    query,
    QueryBinder.from({ propertyName: TARGET_IFC_GUID_PROPERTY_QUERY_NAME }),
    { rowFormat: QueryRowFormat.UseJsPropertyNames },
  );

  for await (const row of reader) {
    if (
      typeof row.schemaName === "string" &&
      typeof row.className === "string" &&
      typeof row.propertyName === "string"
    ) {
      classes.push({
        schemaName: row.schemaName,
        className: row.className,
        propertyName: row.propertyName,
      });
    }
  }

  return classes;
}

async function queryClassElementIdsByIfcGuid(
  imodel: IModelConnection,
  schemaName: string,
  className: string,
  propertyName: string,
  ifcGuid: string,
): Promise<string[]> {
  if (!isValidECSqlIdentifier(schemaName) || !isValidECSqlIdentifier(className) || !isValidECSqlIdentifier(propertyName)) {
    return [];
  }

  const elementIds: string[] = [];
  const query = `
    SELECT ECInstanceId id
    FROM ${schemaName}.${className}
    WHERE ${propertyName} = :ifcGuid
  `;
  let reader;
  try {
    reader = imodel.createQueryReader(
      query,
      QueryBinder.from({ ifcGuid }),
      { rowFormat: QueryRowFormat.UseJsPropertyNames },
    );
  } catch {
    return [];
  }

  try {
    for await (const row of reader) {
      const elementId = getQueryId(row.id);
      if (elementId !== undefined) {
        elementIds.push(elementId);
      }
    }
  } catch {
    return [];
  }

  return elementIds.length === 1 ? elementIds : [];
}

function isValidECSqlIdentifier(value: string): boolean {
  return /^[A-Za-z_]\w*$/.test(value);
}

function getQueryId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }

  return undefined;
}

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
