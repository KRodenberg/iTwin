import { useEffect } from "react";
import { BeEvent } from "@itwin/core-bentley";
import { ColorDef, FeatureAppearance } from "@itwin/core-common";
import { IModelApp, type FeatureOverrideProvider, type ScreenViewport } from "@itwin/core-frontend";
import { FeatureSymbology } from "@itwin/core-frontend";
import { getMeasurementNow, sensorPollQueryLogState, type SensorReading } from "./SensorPollQueryLog";

interface SensorIfcVisualizationSnapshot {
  elementIds: string[];
  sensorReading?: SensorReading;
  queryLogId?: number;
}

class SensorIfcVisualizationState {
  private _snapshot: SensorIfcVisualizationSnapshot = {
    elementIds: [],
  };

  public readonly onChanged = new BeEvent<() => void>();

  public get snapshot(): SensorIfcVisualizationSnapshot {
    return this._snapshot;
  }

  public setElementIds(elementIds: string[]) {
    if (haveSameIds(this._snapshot.elementIds, elementIds)) {
      return;
    }

    this._snapshot = {
      ...this._snapshot,
      elementIds: [...elementIds],
    };
    this.onChanged.raiseEvent();
  }

  public setSensorReading(sensorReading: SensorReading, queryLogId?: number) {
    if (haveSameSensorReading(this._snapshot.sensorReading, sensorReading) && this._snapshot.queryLogId === queryLogId) {
      return;
    }

    this._snapshot = {
      ...this._snapshot,
      sensorReading,
      queryLogId,
    };
    this.onChanged.raiseEvent();
  }
}

class SensorIfcGradientOverrideProvider implements FeatureOverrideProvider {
  private _elementIds: string[] = [];
  private _sensorReading?: SensorReading;

  public update(snapshot: SensorIfcVisualizationSnapshot) {
    this._elementIds = snapshot.elementIds;
    this._sensorReading = snapshot.sensorReading;
  }

  public addFeatureOverrides(overrides: FeatureSymbology.Overrides): void {
    if (this._elementIds.length === 0 || this._sensorReading === undefined) {
      return;
    }

    const appearance = FeatureAppearance.fromRgb(getHumidityGradientColor(this._sensorReading.humidityPercent));
    for (const elementId of this._elementIds) {
      overrides.override({
        elementId,
        appearance,
      });
    }
  }
}

export const sensorIfcVisualizationState = new SensorIfcVisualizationState();

export function useSensorIfcVisualization(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const viewManager = IModelApp.viewManager;
    if (viewManager === undefined) {
      return;
    }

    const provider = new SensorIfcGradientOverrideProvider();
    const attachedViewports = new Set<ScreenViewport>();

    const attach = (viewport: ScreenViewport) => {
      if (attachedViewports.has(viewport)) {
        return;
      }

      viewport.addFeatureOverrideProvider(provider);
      attachedViewports.add(viewport);
    };

    const detach = (viewport: ScreenViewport) => {
      if (!attachedViewports.delete(viewport)) {
        return;
      }

      viewport.dropFeatureOverrideProvider(provider);
    };

    const sync = () => {
      const snapshot = sensorIfcVisualizationState.snapshot;
      provider.update(snapshot);
      for (const viewport of attachedViewports) {
        viewport.setFeatureOverrideProviderChanged();
      }

      if (
        snapshot.queryLogId !== undefined &&
        attachedViewports.size > 0 &&
        sensorPollQueryLogState.shouldMeasureEndToEnd(snapshot.queryLogId)
      ) {
        const queryLogId = snapshot.queryLogId;
        sensorPollQueryLogState.markOverrideNotified(queryLogId, getMeasurementNow());
        window.requestAnimationFrame(() => {
          sensorPollQueryLogState.markNextFrame(queryLogId, getMeasurementNow());
        });
      }
    };

    for (const viewport of viewManager) {
      attach(viewport);
    }

    const removeChangedListener = sensorIfcVisualizationState.onChanged.addListener(sync);
    const removeViewOpenListener = viewManager.onViewOpen.addListener((viewport) => {
      attach(viewport);
      sync();
    });
    const removeViewCloseListener = viewManager.onViewClose.addListener((viewport) => {
      detach(viewport);
    });

    sync();

    return () => {
      removeChangedListener();
      removeViewOpenListener();
      removeViewCloseListener();

      for (const viewport of attachedViewports) {
        viewport.dropFeatureOverrideProvider(provider);
      }
      attachedViewports.clear();
    };
  }, [enabled]);
}

function getHumidityGradientColor(humidityPercent: number): ColorDef {
  const clampedValue = Math.max(40, Math.min(100, humidityPercent));
  const ratio = (clampedValue - 40) / 60;
  const red = Math.round(255 * ratio);
  const green = Math.round(255 * (1 - ratio));
  return ColorDef.from(red, green, 0);
}

function haveSameIds(lhs: string[], rhs: string[]): boolean {
  if (lhs.length !== rhs.length) {
    return false;
  }

  return lhs.every((value, index) => value === rhs[index]);
}

function haveSameSensorReading(lhs: SensorReading | undefined, rhs: SensorReading): boolean {
  if (lhs === undefined) {
    return false;
  }

  return lhs.temperatureC === rhs.temperatureC &&
    lhs.humidityPercent === rhs.humidityPercent &&
    lhs.timestamp === rhs.timestamp &&
    lhs.status === rhs.status;
}
