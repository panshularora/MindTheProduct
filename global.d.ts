declare var pendo: {
  initialize: (options: object) => void;
  trackAgent: (eventType: string, metadata: object) => void;
  [key: string]: any;
};
