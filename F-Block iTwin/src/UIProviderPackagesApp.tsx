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
  createMechanicalEquipmentRandomPropertyDataProvider,
  initializeMechanicalEquipmentRandomEntity,
  randomValueQueryLogState,
  TARGET_ELEMENT_ID64,
  type RandomValueQueryLogEntry,
} from "./common/MechanicalEquipmentRandomPropertyDataProvider";
import { mapLayerOptions } from "./common/MapLayerOptions";
import { useRandomIfcVisualization } from "./common/RandomIfcVisualization";
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
      createDataProvider: createMechanicalEquipmentRandomPropertyDataProvider,
    },
  }),
  new TreeWidgetUiItemsProvider(),
];

const iTwinId = process.env.IMJS_ITWIN_ID;
const iModelId = process.env.IMJS_IMODEL_ID;

const ViewportFrontstageApp = () => {
  const [isIModelAppReady, setIsIModelAppReady] = useState(false);
  const [selectedId64, setSelectedId64] = useState(TARGET_ELEMENT_ID64);
  const [isConsoleLogOpen, setIsConsoleLogOpen] = useState(false);
  const [queryLogEntries, setQueryLogEntries] = useState<RandomValueQueryLogEntry[]>(randomValueQueryLogState.entries);
  useRandomIfcVisualization(isIModelAppReady);

  useEffect(() => {
    if (!isIModelAppReady) {
      return;
    }

    const initializeViewport = (viewport: NonNullable<typeof IModelApp.viewManager.selectedView>): void => {
      void initializeMechanicalEquipmentRandomEntity(viewport.iModel, viewport);
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
      setQueryLogEntries(randomValueQueryLogState.entries);
    };

    const removeQueryLogListener = randomValueQueryLogState.onChanged.addListener(syncQueryLogEntries);
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
          Console Log
        </button>
        {isConsoleLogOpen && (
          <div id="ifc-console-log-list" className="ifc-console-log__panel" role="log" aria-live="polite">
            <div className="ifc-console-log__header">
              <span>Query Time UTC</span>
              <span>{queryLogEntries.length}</span>
            </div>
            <ol className="ifc-console-log__list">
              {queryLogEntries.length === 0 ? (
                <li className="ifc-console-log__empty">No random value queries yet.</li>
              ) : queryLogEntries.map((entry) => (
                <li key={entry.id} className="ifc-console-log__item">
                  {entry.queriedAtUtc}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  </>;
};

export default ViewportFrontstageApp;
