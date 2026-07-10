---
name: database-architecture
description: Database design as an architect - wide tables, denormalization-first, fewer joins. Use when designing schemas, creating migrations, or planning data models. Prefer fewer tables with more columns over many small tables connected by foreign keys.
---

# Database Architecture

Design databases like an architect, not a textbook. Wide tables over join
farms. Denormalize first, normalize only when the cost of duplication exceeds
the cost of joins at scale.

<HARD-GATE>
Before creating a new table, ask: can these columns live in an existing table?
If the data is read together most of the time, it belongs in the same table.
Splitting tables to satisfy normalization theory is premature optimization
for the wrong thing - it optimizes storage (cheap) at the cost of queries
(expensive).
</HARD-GATE>

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "I'll normalize to 3NF" | 3NF is a textbook answer, not a production answer |
| "Small tables are cleaner" | 15 tables joined to render one page is not clean |
| "I can always join them later" | Joins at scale are the #1 performance killer |
| "Foreign keys keep it organized" | FKs enforce integrity, not performance. They add join overhead |
| "I'll add an index to fix the join" | An index on a join is a band-aid. The join shouldn't exist |
| "Denormalization is for later" | Start wide. Narrowing later is easier than widening under load |

## Philosophy

### Wide tables over join farms

A common AI pattern: create a separate table for every entity, connect with
foreign keys, join at query time. This is textbook normalization. It is wrong
for most applications.

**The problem with many small tables:**
- Every read is a multi-table JOIN
- JOINs are O(n*m) at minimum, worse with nested joins
- As data grows, join performance degrades non-linearly
- Memory pressure: the database must hold intermediate result sets
- Network round-trips: ORMs issue N+1 queries when eager loading fails
- Index complexity: each table needs its own indexes, and join columns need
  composite indexes that are expensive to maintain

**The wide-table approach:**
- One table, many columns. Read what you need in one SELECT
- No joins for the 90% case. Search within the table, not across tables
- Indexes on the columns you filter by. Simple, predictable performance
- The database engine is built for column-level filtering, not join gymnastics
- Memory: one row read, not 5 rows from 5 tables stitched together

### When to split tables

Split ONLY when:
1. **The data has a different lifecycle** - orders persist forever, order_items
   are deleted when the order is deleted. Different lifecycle = different table.
2. **The cardinality is genuinely 1-to-many with unbounded many** - a user has
   unlimited posts. You cannot make the posts columns on the users table.
3. **The data is rarely read with the parent** - if you almost never need
   `user.billing_address_history` when reading a user, it can be a separate
   table. If you usually need it, keep it on the user table.
4. **The row would exceed reasonable width** - if a single row would be > 8KB
   of columns, some databases have page-size limits. At that point, split the
   least-accessed columns to a side table.

### When NOT to split tables

Do NOT split when:
1. **It's 1-to-1** - just put the columns on the same table. A separate table
   for `user_profiles` when every user has exactly one profile is a join for
   no reason.
2. **It's 1-to-few (bounded)** - a user has at most 3 addresses (home, work,
   other). Make `address1`, `address2`, `address3` columns. Not an
   `addresses` table.
3. **The data is always read together** - if every API response that includes
   an order also includes the customer name, put `customer_name` on the orders
   table. Yes, it's duplicated. The join costs more than the duplication.
4. **You're splitting for "cleanliness"** - cleanliness is not a performance
   metric. Query speed is.

## Design Process

1. **List the read patterns first** - what queries will run? What fields does
   each query need? This determines the schema, not the other way around.
2. **Group fields by read pattern** - fields that are always read together go
   on the same table. Fields that are read independently can be split.
3. **Start wide** - put everything on one table. Add columns, not tables.
4. **Split only when forced** - when a split is clearly justified by lifecycle,
   cardinality, or width. Not before.
5. **Index the filter columns** - the columns in WHERE clauses get indexes.
   The columns in SELECT do not need indexes.
6. **Denormalize aggressively for read-heavy tables** - copy the customer name
   to the orders table. Copy the product name to the line_items table. Reads
   are 100x more frequent than writes in most apps.
7. **Use JSON columns for semi-structured data** - instead of a separate table
   for tags, metadata, or settings, use a JSON/JSONB column. Most databases
   support indexing JSON keys.

## Rules

- NEVER create a 1-to-1 table. Put the columns on the parent table.
- NEVER create a table for bounded (1-to-few) relationships. Use columns.
- NEVER create a join table for a relationship that could be a JSON column.
- ALWAYS list read patterns before designing the schema.
- ALWAYS denormalize fields that are read together but written separately.
- ALWAYS index the columns used in WHERE clauses, not SELECT.
- ALWAYS prefer one wide table with 30 columns over 5 tables with 6 columns
  each, when the data is read together.
- ALWAYS use JSON/JSONB columns for variable-structure data instead of
  EAV (entity-attribute-value) tables.
- NEVER use EAV. It is the worst of both worlds: unbounded joins AND no type
  safety.

## Migration Patterns

When refactoring an over-normalized schema to wide tables:

1. Add the new columns to the target table (nullable first)
2. Backfill from the joined tables in batches
3. Switch reads to use the new columns
4. Switch writes to populate the new columns
5. Backfill any remaining rows
6. Make columns NOT NULL if needed
7. Drop the old tables only after confirming no reads/writes use them

Never do a big-bang migration. Always batch, always have a fallback.

## Common Anti-Patterns

- **User profile table**: `users` + `user_profiles` (1-to-1). Merge into one
  `users` table.
- **Settings table**: `user_settings` with `user_id`, `key`, `value` (EAV).
  Use a JSON column on the `users` table instead.
- **Address table**: `addresses` with `user_id`, `type`, `line1`, ... when
  users have at most 2-3 addresses. Use `home_address_*` and `work_address_*`
  columns.
- **Tags join table**: `posts` + `tags` + `post_tags`. If tags are mostly
  read-only and don't need individual management, use a JSON array column on
  `posts`.
- **Audit log as separate table joined to entity**: if you always read the
  last action with the entity, put `last_action_at`, `last_action_by` on the
  entity table. Keep the full audit log separate only if you query it
  independently.
