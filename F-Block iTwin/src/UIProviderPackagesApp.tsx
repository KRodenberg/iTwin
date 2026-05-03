/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React, { useCallback, useEffect, useState } from "react";
import { Viewer, ViewerContentToolsProvider, ViewerNavigationToolsProvider, ViewerStatusbarItemsProvider } from "@itwin/web-viewer-react";
import { IModelApp } from "@itwin/core-frontend";
import { MeasureTools, MeasureToolsUiItemsProvider } from "@itwin/measure-tools-react";
import { PropertyGridManager, PropertyGridUiItemsProvider } from "@itwin/property-grid-react";
import { TreeWidget, TreeWidgetUiItemsProvider } from "@itwin/tree-widget-react";
import { authClient } from "./common/AuthorizationClient";
import {
  createMechanicalEquipmentRandomPropertyDataProvider,
  initializeMechanicalEquipmentRandomEntity,
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
  useRandomIfcVisualization(isIModelAppReady);

  useEffect(() => {
    if (!isIModelAppReady) {
      return;
    }

    const initializeViewport = (viewport: NonNullable<typeof IModelApp.viewManager.selectedView>): void => {
      void initializeMechanicalEquipmentRandomEntity(viewport.iModel, viewport);
    };

    const selectedViewport = IModelApp.viewManager.selectedView;
    if (selectedViewport !== undefined) {
      initializeViewport(selectedViewport);
    } else {
      Array.from(IModelApp.viewManager).forEach(initializeViewport);
    }

    const removeViewOpenListener = IModelApp.viewManager.onViewOpen.addListener(initializeViewport);

    return () => {
      removeViewOpenListener();
    };
  }, [isIModelAppReady]);

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
  return <Viewer
    iTwinId={iTwinId ?? ""}
    iModelId={iModelId ?? ""}
    authClient={authClient}
    viewportOptions={viewportOptions}
    mapLayerOptions={mapLayerOptions}
    enablePerformanceMonitors={false}
    onIModelAppInit={onIModelAppInit}
    uiProviders={uiProviders}
    theme={process.env.THEME ?? "dark"}
  />;
};

export default ViewportFrontstageApp;
