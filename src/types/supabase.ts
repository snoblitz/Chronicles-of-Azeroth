// ============================================================================
// Supabase database types.
//
// PLACEHOLDER — regenerate this file from the live schema once the Supabase
// project exists:
//
//   supabase gen types typescript --project-id <ref> > src/types/supabase.ts
//   # or, against a local stack:
//   supabase gen types typescript --local > src/types/supabase.ts
//
// See docs/supabase.md. Until then this minimal stub keeps the typed client in
// src/lib/supabase.ts compiling without pretending to know column shapes.
// ============================================================================

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
