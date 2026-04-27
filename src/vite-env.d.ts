/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'omni-timeline': any;
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'omni-timeline': any;
    }
  }
}
