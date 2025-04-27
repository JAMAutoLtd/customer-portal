*   Import database types (`Database`, `Tables`, `TablesInsert`, `Enums`) and the `insertData` utility from `simulation/scripts/utils/index.ts`.
*   Define local types using `Tables<'table_name'>` for expected rows and `TablesInsert<'table_name'>` for data to be inserted.
*   When preparing data for insertion, use the `TablesInsert` type.
*   Call the `insertData(supabaseAdmin, tableName, dataArray, description)` utility.
*   Always check the returned `{ data, error }` object. Handle errors appropriately.
*   If data needs to be linked (e.g., jobs to orders), use the actual IDs from the `data` array returned by the *first* `insertData` call when constructing the data for the *second* insertion.
*   For scenario scripts, return the actual IDs of created records in the `ScenarioMetadataUpdate` object.