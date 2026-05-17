import { BeEvent } from "@itwin/core-bentley";

export interface RandomValueQueryLogEntry {
  id: number;
  queriedAtUtc: string;
  queryStartedAtMs: number;
  isEndToEndTest: boolean;
  responseReceivedAtMs?: number;
  valueParsedAtMs?: number;
  valueAppliedAtMs?: number;
  overrideNotifiedAtMs?: number;
  nextFrameAtMs?: number;
  randomValue?: number;
  errorMessage?: string;
}

class RandomValueQueryLogState {
  private _entries: RandomValueQueryLogEntry[] = [];
  private _nextId = 1;
  private _isEndToEndTesting = false;

  public readonly onChanged = new BeEvent<() => void>();

  public get entries(): RandomValueQueryLogEntry[] {
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
    this.updateEntry(id, { responseReceivedAtMs });
  }

  public markValueParsed(id: number, valueParsedAtMs: number, randomValue: number): void {
    this.updateEntry(id, { valueParsedAtMs, randomValue });
  }

  public markValueApplied(id: number, valueAppliedAtMs: number): void {
    this.updateEntry(id, { valueAppliedAtMs });
  }

  public markOverrideNotified(id: number, overrideNotifiedAtMs: number): void {
    this.updateEntryIfUnset(id, "overrideNotifiedAtMs", overrideNotifiedAtMs);
  }

  public markNextFrame(id: number, nextFrameAtMs: number): void {
    this.updateEntryIfUnset(id, "nextFrameAtMs", nextFrameAtMs);
  }

  public markFailed(id: number, failedAtMs: number, errorMessage: string): void {
    this.updateEntry(id, {
      errorMessage,
      responseReceivedAtMs: this.findEntry(id)?.responseReceivedAtMs ?? failedAtMs,
    });
  }

  private updateEntry(id: number, updates: Partial<RandomValueQueryLogEntry>): void {
    let didUpdate = false;
    this._entries = this._entries.map((entry) => {
      if (entry.id !== id) {
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

  private updateEntryIfUnset<K extends keyof RandomValueQueryLogEntry>(
    id: number,
    key: K,
    value: RandomValueQueryLogEntry[K],
  ): void {
    const entry = this.findEntry(id);
    if (entry === undefined || entry[key] !== undefined) {
      return;
    }

    this.updateEntry(id, { [key]: value } as Partial<RandomValueQueryLogEntry>);
  }

  private findEntry(id: number): RandomValueQueryLogEntry | undefined {
    return this._entries.find((entry) => entry.id === id);
  }
}

export const randomValueQueryLogState = new RandomValueQueryLogState();

export function getMeasurementNow(): number {
  return performance.now();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
