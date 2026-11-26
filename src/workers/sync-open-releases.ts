import 'dotenv/config';
import { processOpenReleaseFeeds } from '@/ingestion/open-data/scheduler';
import { getDatabase } from '@/lib/db';
process.env.OPEN_DATA_RELEASE_SYNC ??= 'true';
try { console.log(JSON.stringify(await processOpenReleaseFeeds(100), null, 2)); }
finally { await getDatabase().$disconnect(); }
