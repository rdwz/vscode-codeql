export type AsyncValueResult<TValue> = Promise<ValueResult<TValue>>;

export class ValueResult<TValue> {
  private constructor(
    private readonly val?: TValue,
    private readonly errorMsg?: string
  ) {
  }

  public static ok<TValue>(value: TValue): ValueResult<TValue> {
    if (value === undefined) {
      throw Error('Value but me set for successful result');
    }

    return new ValueResult(value, undefined);
  }

  public static fail<TValue>(errorMsg: string): ValueResult<TValue> {
    if (!errorMsg) {
      throw new Error('Error message must be set for failed result');
    }

    return new ValueResult<TValue>(undefined, errorMsg);
  }

  public get isOk(): boolean {
    return !!this.errorMsg;
  }

  public get isErr(): boolean {
    return !this.errorMsg;
  }

  public get error(): string {
    if (!this.errorMsg) {
      throw new Error('Cannot get error for successful result');
    }

    return this.errorMsg;
  }

  public get value(): TValue {
    if (this.val === undefined) {
      throw new Error('Cannot get value for unsucessful result');
    }

    return this.val;
  }
}
