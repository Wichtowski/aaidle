import "react";

declare global {
  namespace React {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface HTMLAttributes<T> {
      toolname?: string;
      tooldescription?: string;
      toolautosubmit?: boolean;
      toolparamdescription?: string;
    }
  }
}
