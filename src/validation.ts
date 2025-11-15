import type { ZodSchema } from "zod";

type Next = () => Promise<Response | undefined>;

export const validate = <T>(schema: ZodSchema<T>, source: "body" | "query" | "params" = "body") => {
  return async (req: any, next?: Next) => {
    try {
      const data = source === "body" ? req.body : 
                   source === "query" ? req.query : 
                   req.params;

      const validated = schema.parse(data);
      req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = validated;
      
      // If next exists, call it (used as middleware with .use())
      if (next) {
        const result = await next();
        return result;
      }
      
      // If no next, return undefined (used inline with routes)
      return undefined;
    } catch (err: any) {
      return new Response(
        JSON.stringify({ 
          error: "Validation failed", 
          details: err.errors || err.message 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  };
};