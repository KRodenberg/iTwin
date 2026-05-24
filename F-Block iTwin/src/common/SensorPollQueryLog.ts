import { BeEvent } from "@itwin/core-bentley";

export interface SensorReading {
  temperatureC: number;
  humidityPercent: number;
  timestamp?: string;
  status?: string;
}

export interface SensorPollQueryLogEntry {
  id: number;
  queriedAtUtc: string;
  queryStartedAtMs: number;
  isEndToEndTest: boolean;
  responseReceivedAtMs?: number;
  valueParsedAtMs?: number;
  valueAppliedAtMs?: number;
  overrideNotifiedAtMs?: number;
  nextFrameAtMs?: number;
  temperatureC?: number;
  humidityPercent?: number;
  errorMessage?: string;
}

class SensorPollQueryLogState {
  private _entries: SensorPollQueryLogEntry[] = [];
  private _nextId = 1;
  private _isEndToEndTesting = false;

  public readonly onChanged = new BeEvent<() => void>();

  public get entries(): SensorPollQueryLogEntry[] {
    return this._entries;
  }

  public get isEndToEndTesting(): boolean {
    return this._isEndToEndTesting;
  }

  public startEndToEndTesting(): void {
    if (this._isEndToEndTesting) {
      return;
    }

    this._isEndToEndTesting = true;
    this.onChanged.raiseEvent();
  }

  public shouldMeasureEndToEnd(id: number): boolean {
    return this._isEndToEndTesting && this.findEntry(id)?.isEndToEndTest === true;
  }

  public addQueryStarted(queriedAtUtc: string, queryStartedAtMs: number): number {
    const id = this._nextId;
    this._nextId += 1;

    this._entries = [
      {
        id,
        queriedAtUtc,
        queryStartedAtMs,
        isEndToEndTest: this._isEndToEndTesting,
      },
      ...this._entries,
    ].slice(0, 10000);

    this.onChanged.raiseEvent();
    return id;
  }

  public markResponseReceived(id: number, responseReceivedAtMs: number): void {
    this.updateEntry({ id, responseReceivedAtMs });
  }

  public markReadingParsed(id: number, valueParsedAtMs: number, reading: SensorReading): void {
    this.updateEntry({
      id,
      valueParsedAtMs,
      temperatureC: reading.temperatureC,
      humidityPercent: reading.humidityPercent,
    });
  }

  public markValueApplied(id: number, valueAppliedAtMs: number): void {
    this.updateEntry({ id, valueAppliedAtMs });
  }

  public markOverrideNotified(id: number, overrideNotifiedAtMs: number): void {
    this.updateEntryIfUnset(id, "overrideNotifiedAtMs", overrideNotifiedAtMs);
  }

  public markNextFrame(id: number, nextFrameAtMs: number): void {
    this.updateEntryIfUnset(id, "nextFrameAtMs", nextFrameAtMs);
  }

  public markFailed(id: number, failedAtMs: number, errorMessage: string): void {
    this.updateEntry({
      id,
      errorMessage,
      responseReceivedAtMs: this.findEntry(id)?.responseReceivedAtMs ?? failedAtMs,
    });
  }

  private updateEntry(updates: Partial<SensorPollQueryLogEntry> & { id: number }): void {
    let didUpdate = false;
    this._entries = this._entries.map((entry) => {
      if (entry.id !== updates.id) {
        return entry;
      }

      didUpdate = true;
      return {
        ...entry,
        ...updates,
      };
    });

    if (didUpdate) {
      this.onChanged.raiseEvent();
    }
  }

  private updateEntryIfUnset<K extends keyof SensorPollQueryLogEntry>(
    id: number,
    key: K,
    value: SensorPollQueryLogEntry[K],
  ): void {
    const entry = this.findEntry(id);
    if (entry === undefined || entry[key] !== undefined) {
      return;
    }

    this.updateEntry({ id, [key]: value } as Partial<SensorPollQueryLogEntry> & { id: number });
  }

  private findEntry(id: number): SensorPollQueryLogEntry | undefined {
    return this._entries.find((entry) => entry.id === id);
  }
}

export const sensorPollQueryLogState = new SensorPollQueryLogState();

export function getMeasurementNow(): number {
  return performance.now();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
