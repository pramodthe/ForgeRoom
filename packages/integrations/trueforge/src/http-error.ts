export class TrueForgeHttpError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;

  constructor(message: string, input: { status: number; method: string; path: string }) {
    super(message);
    this.name = "TrueForgeHttpError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
  }
}
