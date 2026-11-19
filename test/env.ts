// Tests read their own small skills and personalities, so an edit to Talk's real ones never changes a test.
import { join } from "node:path";
const here = new URL(".", import.meta.url).pathname;
process.env.TALK_SKILLS_DIR = join(here, "fixtures", "skills");
process.env.TALK_PERSONAS_DIR = join(here, "fixtures", "personalities");
process.env.TALK_WRITES_FLAG = join(here, "fixtures", "writes.enabled");
