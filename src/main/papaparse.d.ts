declare module 'papaparse' {
  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: {
      delimiter: string;
      linebreak: string;
    };
  }

  const Papa: {
    parse<T>(input: string, config?: Record<string, unknown>): ParseResult<T>;
    unparse(input: unknown, config?: Record<string, unknown>): string;
  };

  export default Papa;
}
