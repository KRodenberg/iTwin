import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import type { PropertyData, PropertyCategory } from "@itwin/components-react";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import type { IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { createSelectionScopeProps, Presentation } from "@itwin/presentation-frontend";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { sensorIfcVisualizationState } from "./SensorIfcVisualization";
import { getErrorMessage, getMeasurementNow, sensorPollQueryLogState, type SensorReading } from "./SensorPollQueryLog";

const TARGET_IFC_GUID = "0GYqmJBIb6LPFuePZ9lxOc";
const IFC_CATEGORY_LABEL = "IFC";
const TARGET_IFC_GUID_PROPERTY = "IFCGUID";
const TEMPERATURE_PROPERTY_NAME = "Temperature";
const TEMPERATURE_PROPERTY_LABEL = "Temperature (C)";
const HUMIDITY_PROPERTY_NAME = "Humidity";
const HUMIDITY_PROPERTY_LABEL = "Humidity (%)";
const SENSOR_CATEGORY_NAME = "__ifc_sensor__";
const SENSOR_SOURCE_URL = "/api/poll";
const SENSOR_POLL_INTERVAL_MS = 1000;
const TARGET_IFC_GUID_PROPERTY_QUERY_NAME = "IFCGUID";
export const TARGET_ELEMENT_ID64 = "0x20000000a76";

type SensorApiResponse = {
  temperature_c?: unknown;
  humidity_percent?: unknown;
  timestamp?: unknown;
  status?: unknown;
};

interface SensorReadingResponse {
  reading: SensorReading;
  queryLogId: number;
}

interface IfcGuidClass {
  schemaName: string;
  className: string;
  propertyName: string;
}

let startupSelectionTimer: number | undefined;
let startupSelectionInFlight = false;
let startupSelectionComplete = false;
let startupSensorRefreshTimer: number | undefined;

export class MechanicalEquipmentSensorPropertyDataProvider extends PresentationPropertyDataProvider {
  private _temperatureValue = "Loading...";
  private _humidityValue = "Loading...";
  private _removeSensorReadingListener?: () => void;
  private _disposed = false;

  public constructor(imodel: IModelConnection) {
    super({ imodel });

    startStartupSensorRefresh();
    this._removeSensorReadingListener = sensorIfcVisualizationState.onChanged.addListener(() => {
      this.syncSensorReading();
    });
    this.syncSensorReading();
  }

  public override dispose(): void {
    this._disposed = true;

    if (this._removeSensorReadingListener !== undefined) {
      this._removeSensorReadingListener();
      this._removeSensorReadingListener = undefined;
    }

    super.dispose();
  }

  public override async getData(): Promise<PropertyData> {
    const data = await super.getData();
    return this.withSensorProperties(data);
  }

  private syncSensorReading(): void {
    if (this._disposed) {
      return;
    }

    const sensorReading = sensorIfcVisualizationState.snapshot.sensorReading;
    const nextTemperatureValue = sensorReading === undefined ? "Loading..." : formatTemperature(sensorReading.temperatureC);
    const nextHumidityValue = sensorReading === undefined ? "Loading..." : formatHumidity(sensorReading.humidityPercent);
    if (this._temperatureValue === nextTemperatureValue && this._humidityValue === nextHumidityValue) {
      return;
    }

    this._temperatureValue = nextTemperatureValue;
    this._humidityValue = nextHumidityValue;
    this.onDataChanged.raiseEvent();
  }

  private withSensorProperties(data: PropertyData): PropertyData {
    if (!hasTargetIfcGuid(data.records)) {
      return data;
    }

    const matchingCategoryNames = collectIfcCategoryNames(data.categories);
    const elementIds = getCurrentElementIds(this);
    if (elementIds.length > 0) {
      sensorIfcVisualizationState.setElementIds(elementIds);
    }

    const categories = [...data.categories];
    if (matchingCategoryNames.size === 0) {
      categories.push({
        name: SENSOR_CATEGORY_NAME,
        label: IFC_CATEGORY_LABEL,
        expand: true,
      });
      matchingCategoryNames.add(SENSOR_CATEGORY_NAME);
    }

    const temperatureRecord = PropertyRecord.fromString(this._temperatureValue, {
      name: TEMPERATURE_PROPERTY_NAME,
      displayLabel: TEMPERATURE_PROPERTY_LABEL,
      typename: "string",
    });
    const humidityRecord = PropertyRecord.fromString(this._humidityValue, {
      name: HUMIDITY_PROPERTY_NAME,
      displayLabel: HUMIDITY_PROPERTY_LABEL,
      typename: "string",
    });
    const injectedPropertyNames = new Set([TEMPERATURE_PROPERTY_NAME, HUMIDITY_PROPERTY_NAME]);

    const records = { ...data.records };
    for (const categoryName of matchingCategoryNames) {
      const existingRecords = records[categoryName] ?? [];
      records[categoryName] = [
        ...existingRecords.filter((record) => !injectedPropertyNames.has(record.property.name)),
        temperatureRecord,
        humidityRecord,
      ];
    }

    return {
      ...data,
      categories,
      records,
    };
  }
}

export const createMechanicalEquipmentSensorPropertyDataProvider = (imodel: IModelConnection) =>
  new MechanicalEquipmentSensorPropertyDataProvider(imodel);

export async function initializeMechanicalEquipmentSensorEntity(imodel: IModelConnection, viewport?: ScreenViewport): Promise<void> {
  startStartupSelection(imodel, viewport);
  startStartupSensorRefresh();
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
      sensorIfcVisualizationState.setElementIds(idsToSelect);
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

function startStartupSensorRefresh(): void {
  if (startupSensorRefreshTimer !== undefined) {
    return;
  }

  void refreshStartupSensorReading();
  startupSensorRefreshTimer = window.setInterval(() => {
    void refreshStartupSensorReading();
  }, SENSOR_POLL_INTERVAL_MS);
}

async function refreshStartupSensorReading(): Promise<void> {
  try {
    const sensorReadingResponse = await fetchSensorReading();
    sensorPollQueryLogState.markValueApplied(sensorReadingResponse.queryLogId, getMeasurementNow());
    sensorIfcVisualizationState.setSensorReading(sensorReadingResponse.reading, sensorReadingResponse.queryLogId);
  } catch (error) {
    console.warn("Unable to fetch startup sensor reading.", error);
  }
}

async function fetchSensorReading(): Promise<SensorReadingResponse> {
  const queryLogId = sensorPollQueryLogState.addQueryStarted(new Date().toISOString(), getMeasurementNow());

  try {
    const response = await fetch(SENSOR_SOURCE_URL, { cache: "no-store" });
    sensorPollQueryLogState.markResponseReceived(queryLogId, getMeasurementNow());
    if (!response.ok) {
      throw new Error(`Sensor poll request failed with ${response.status}`);
    }

    const payload = (await response.json()) as SensorApiResponse;
    const reading = parseSensorReading(payload);

    sensorPollQueryLogState.markReadingParsed(queryLogId, getMeasurementNow(), reading);
    return {
      reading,
      queryLogId,
    };
  } catch (error) {
    sensorPollQueryLogState.markFailed(queryLogId, getMeasurementNow(), getErrorMessage(error));
    throw error;
  }
}

function parseSensorReading(payload: SensorApiResponse): SensorReading {
  const temperatureC = getFiniteNumber(payload.temperature_c);
  if (temperatureC === undefined) {
    throw new Error("Sensor poll response did not include numeric temperature_c");
  }

  const humidityPercent = getFiniteNumber(payload.humidity_percent);
  if (humidityPercent === undefined) {
    throw new Error("Sensor poll response did not include numeric humidity_percent");
  }

  const status = typeof payload.status === "string" ? payload.status : undefined;
  if (status !== undefined && status.toLowerCase() !== "ok") {
    throw new Error(`Sensor poll response status was ${status}`);
  }

  return {
    temperatureC,
    humidityPercent,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
    status,
  };
}

function getFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
}

function formatTemperature(temperatureC: number): string {
  return `${temperatureC.toFixed(1)} C`;
}

function formatHumidity(humidityPercent: number): string {
  return `${humidityPercent.toFixed(0)}%`;
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
