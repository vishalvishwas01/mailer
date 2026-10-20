
import "server-only";

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is missing. Add it to .env.local and restart the server."
  );
}

const openai = new OpenAI({
  apiKey,
});

export default openai;
