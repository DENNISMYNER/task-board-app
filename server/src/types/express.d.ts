// Declaration merging: lets TypeScript know `authenticate` attaches the user id to the request.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
