export class ServiceError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }

  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
