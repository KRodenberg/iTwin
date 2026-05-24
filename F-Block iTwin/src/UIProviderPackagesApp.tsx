/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React, { useCallback, useEffect, useState } from "react";
import { Viewer, ViewerContentToolsProvider, ViewerNavigationToolsProvider, ViewerStatusbarItemsProvider } from "@itwin/web-viewer-react";
import { IModelApp } from "@itwin/core-frontend";
import type { IModelConnection } from "@itwin/core-frontend";
import { MeasureTools, MeasureToolsUiItemsProvider } from "@itwin/measure-tools-react";
import { PropertyGridManager, PropertyGridUiItemsProvider } from "@itwin/property-grid-react";
import { TreeWidget, TreeWidgetUiItemsProvider } from "@itwin/tree-widget-react";
import { authClient } from "./common/AuthorizationClient";
import {
  createMechanicalEquipmentSensorPropertyDataProvider,
  initializeMechanicalEquipmentSensorEntity,
  TARGET_ELEMENT_ID64,
} from "./common/MechanicalEquipmentSensorPropertyDataProvider";
import { mapLayerOptions } from "./common/MapLayerOptions";
import { sensorIfcVisualizationState, useSensorIfcVisualization } from "./common/SensorIfcVisualization";
import { sensorPollQueryLogState, type SensorPollQueryLogEntry } from "./common/SensorPollQueryLog";
import { ViewSetup } from "./common/ViewSetup";

const viewportOptions = {
  viewState: ViewSetup.getDefaultView,
};
const uiProviders = [
  new ViewerContentToolsProvider(),
  new ViewerNavigationToolsProvider(),
  new ViewerStatusbarItemsProvider(),
  new MeasureToolsUiItemsProvider(),
  new PropertyGridUiItemsProvider({
    propertyGridProps: {
      createDataProvider: createMechanicalEquipmentSensorPropertyDataProvider,
    },
  }),
  new TreeWidgetUiItemsProvider(),
];

const iTwinId = process.env.IMJS_ITWIN_ID;
const iModelId = process.env.IMJS_IMODEL_ID;

function getDurationLabel(startAtMs: number, endAtMs: number | undefined): string {
  return endAtMs === undefined ? "..." : `${Math.max(0, endAtMs - startAtMs).toFixed(1)}ms`;
}

function getSensorReadingLabel(entry: SensorPollQueryLogEntry): string {
  if (entry.temperatureC === undefined || entry.humidityPercent === undefined) {
    return "...";
  }

  return `${entry.temperatureC.toFixed(1)} C / ${entry.humidityPercent.toFixed(0)}%`;
}

const ViewportFrontstageApp = () => {
  const [isIModelAppReady, setIsIModelAppReady] = useState(false);
  const [selectedId64, setSelectedId64] = useState(TARGET_ELEMENT_ID64);
  const [isConsoleLogOpen, setIsConsoleLogOpen] = useState(false);
  const [isStartingEndToEndTest, setIsStartingEndToEndTest] = useState(false);
  const [isEndToEndTesting, setIsEndToEndTesting] = useState(sensorPollQueryLogState.isEndToEndTesting);
  const [queryLogEntries, setQueryLogEntries] = useState<SensorPollQueryLogEntry[]>(sensorPollQueryLogState.entries);
  useSensorIfcVisualization(isIModelAppReady);

  useEffect(() => {
    if (!isIModelAppReady) {
      return;
    }

    const initializeViewport = (viewport: NonNullable<typeof IModelApp.viewManager.selectedView>): void => {
      void initializeMechanicalEquipmentSensorEntity(viewport.iModel, viewport);
    };
    const updateSelectedId64 = (imodel: IModelConnection): void => {
      const selectedIds = Array.from(imodel.selectionSet.elements);
      setSelectedId64(selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : TARGET_ELEMENT_ID64);
    };
    const selectionListenerRemovers = new Map<IModelConnection, () => void>();
    const watchSelection = (imodel: IModelConnection): void => {
      if (selectionListenerRemovers.has(imodel)) {
        return;
      }

      selectionListenerRemovers.set(
        imodel,
        imodel.selectionSet.onChanged.addListener(() => {
          updateSelectedId64(imodel);
        }),
      );
      updateSelectedId64(imodel);
    };

    const selectedViewport = IModelApp.viewManager.selectedView;
    if (selectedViewport !== undefined) {
      initializeViewport(selectedViewport);
      watchSelection(selectedViewport.iModel);
    } else {
      Array.from(IModelApp.viewManager).forEach((viewport) => {
        initializeViewport(viewport);
        watchSelection(viewport.iModel);
      });
    }

    const removeViewOpenListener = IModelApp.viewManager.onViewOpen.addListener((viewport) => {
      initializeViewport(viewport);
      watchSelection(viewport.iModel);
    });

    return () => {
      removeViewOpenListener();
      selectionListenerRemovers.forEach((removeListener) => {
        removeListener();
      });
      selectionListenerRemovers.clear();
    };
  }, [isIModelAppReady]);

  useEffect(() => {
    const syncQueryLogEntries = (): void => {
      setQueryLogEntries(sensorPollQueryLogState.entries);
      setIsEndToEndTesting(sensorPollQueryLogState.isEndToEndTesting);
    };

    const removeQueryLogListener = sensorPollQueryLogState.onChanged.addListener(syncQueryLogEntries);
    syncQueryLogEntries();

    return () => {
      removeQueryLogListener();
    };
  }, []);

  /** Sign-in */
  useEffect(() => {
    void authClient.signIn();
  }, []);

  const onIModelAppInit = useCallback(async () => {
    await MeasureTools.startup();
    await PropertyGridManager.initialize();
    await TreeWidget.initialize();
    setIsIModelAppReady(true);
  }, []);

  const startEndToEndTesting = useCallback(async () => {
    const viewport = IModelApp.viewManager.selectedView ?? Array.from(IModelApp.viewManager)[0];
    if (viewport === undefined) {
      console.warn("Unable to start end-to-end test because no viewport is open.");
      return;
    }

    setIsStartingEndToEndTest(true);
    try {
      viewport.iModel.selectionSet.replace(TARGET_ELEMENT_ID64);
      sensorIfcVisualizationState.setElementIds([TARGET_ELEMENT_ID64]);
      setSelectedId64(TARGET_ELEMENT_ID64);
      await viewport.zoomToElements([TARGET_ELEMENT_ID64], {
        animateFrustumChange: true,
        paddingPercent: 0.35,
        minimumDimension: 2,
      });
    } catch (error) {
      console.warn(`Unable to zoom to ID64 ${TARGET_ELEMENT_ID64} before end-to-end testing.`, error);
    } finally {
      sensorPollQueryLogState.startEndToEndTesting();
      setIsStartingEndToEndTest(false);
      setIsConsoleLogOpen(true);
    }
  }, []);

  /** The sample's render method */
  return <>
    <Viewer
      iTwinId={iTwinId ?? ""}
      iModelId={iModelId ?? ""}
      authClient={authClient}
      viewportOptions={viewportOptions}
      mapLayerOptions={mapLayerOptions}
      enablePerformanceMonitors={false}
      onIModelAppInit={onIModelAppInit}
      uiProviders={uiProviders}
      theme={process.env.THEME ?? "dark"}
    />
    <div className="ifc-status-overlays">
      <aside className="ifc-id64-overlay" aria-label="Selected IFC object ID64">
        <span className="ifc-id64-overlay__label">ID64</span>
        <span className="ifc-id64-overlay__value">{selectedId64}</span>
      </aside>
      <div className="ifc-console-log">
        <button
          type="button"
          className="ifc-console-log__toggle"
          aria-expanded={isConsoleLogOpen}
          aria-controls="ifc-console-log-list"
          onClick={() => {
            setIsConsoleLogOpen((isOpen) => !isOpen);
          }}
        >
          Sensor Poll Log
        </button>
        {isConsoleLogOpen && (
          <div id="ifc-console-log-list" className="ifc-console-log__panel" role="log" aria-live="polite">
            <div className="ifc-console-log__header">
              <span>Query Time UTC</span>
              <span>{queryLogEntries.length}</span>
            </div>
            <ol className="ifc-console-log__list">
              {queryLogEntries.length === 0 ? (
                <li className="ifc-console-log__empty">No sensor polls yet.</li>
              ) : queryLogEntries.map((entry) => (
                <li key={entry.id} className="ifc-console-log__item">
                  <span className="ifc-console-log__time">{entry.queriedAtUtc}</span>
                  <span className="ifc-console-log__metric">{getSensorReadingLabel(entry)}</span>
                  <span className="ifc-console-log__metric">net {getDurationLabel(entry.queryStartedAtMs, entry.responseReceivedAtMs)}</span>
                  <span className="ifc-console-log__metric">apply {getDurationLabel(entry.queryStartedAtMs, entry.valueAppliedAtMs)}</span>
                  <span className="ifc-console-log__metric">
                    e2e {entry.isEndToEndTest ? getDurationLabel(entry.queryStartedAtMs, entry.nextFrameAtMs) : "off"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <button
        type="button"
        className="ifc-end-to-end-test__button"
        disabled={!isIModelAppReady || isStartingEndToEndTest}
        onClick={() => {
          void startEndToEndTesting();
        }}
      >
        {isStartingEndToEndTest ? "Starting..." : isEndToEndTesting ? "Testing" : "Start E2E Test"}
      </button>
    </div>
  </>;
};

export default ViewportFrontstageApp;
