import { useEffect } from "react";
import { BeEvent } from "@itwin/core-bentley";
import { ColorDef, FeatureAppearance } from "@itwin/core-common";
import { IModelApp, type FeatureOverrideProvider, type ScreenViewport } from "@itwin/core-frontend";
import { FeatureSymbology } from "@itwin/core-frontend";

interface RandomIfcVisualizationSnapshot {
  elementIds: string[];
  randomValue?: number;
}

class RandomIfcVisualizationState {
  private _snapshot: RandomIfcVisualizationSnapshot = {
    elementIds: [],
  };

  public readonly onChanged = new BeEvent<() => void>();

  public get snapshot(): RandomIfcVisualizationSnapshot {
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

  public setRandomValue(randomValue: number) {
    if (this._snapshot.randomValue === randomValue) {
      return;
    }

    this._snapshot = {
      ...this._snapshot,
      randomValue,
    };
    this.onChanged.raiseEvent();
  }
}

class RandomIfcGradientOverrideProvider implements FeatureOverrideProvider {
  private _elementIds: string[] = [];
  private _randomValue?: number;

  public update(snapshot: RandomIfcVisualizationSnapshot) {
    this._elementIds = snapshot.elementIds;
    this._randomValue = snapshot.randomValue;
  }

  public addFeatureOverrides(overrides: FeatureSymbology.Overrides): void {
    if (this._elementIds.length === 0 || this._randomValue === undefined) {
      return;
    }

    const appearance = FeatureAppearance.fromRgb(getGradientColor(this._randomValue));
    for (const elementId of this._elementIds) {
      overrides.override({
        elementId,
        appearance,
      });
    }
  }
}

export const randomIfcVisualizationState = new RandomIfcVisualizationState();

export function useRandomIfcVisualization(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const viewManager = IModelApp.viewManager;
    if (viewManager === undefined) {
      return;
    }

    const provider = new RandomIfcGradientOverrideProvider();
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
      provider.update(randomIfcVisualizationState.snapshot);
      for (const viewport of attachedViewports) {
        viewport.setFeatureOverrideProviderChanged();
      }
    };

    for (const viewport of viewManager) {
      attach(viewport);
    }

    const removeChangedListener = randomIfcVisualizationState.onChanged.addListener(sync);
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

function getGradientColor(randomValue: number): ColorDef {
  const clampedValue = Math.max(0, Math.min(100, randomValue));
  const ratio = clampedValue / 100;
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
