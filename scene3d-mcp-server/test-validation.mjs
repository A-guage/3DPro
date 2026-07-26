import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const z4mini = require("zod/v4-mini");
const { CallToolResultSchema } = require("@modelcontextprotocol/sdk/types.js");

const planSceneResult = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        action: "plan_scene",
        scene_description: "test scene",
        objects: [
          {
            label: "test object",
            description: "a test object",
            priority: 1,
            status: "planned",
          },
        ],
        total: 1,
      }),
    },
  ],
};

console.log("Testing CallToolResultSchema validation with plan_scene result...");
console.log("Input:", JSON.stringify(planSceneResult, null, 2));

try {
  const result = z4mini.safeParse(CallToolResultSchema, planSceneResult);
  console.log("\nValidation result:");
  console.log("  success:", result.success);
  if (result.success) {
    console.log("  data:", JSON.stringify(result.data, null, 2));
  } else {
    console.log("  error:", JSON.stringify(result.error, null, 2));
    if (result.error && result.error.issues) {
      console.log("  issues:", JSON.stringify(result.error.issues, null, 2));
    }
  }
} catch (e) {
  console.error("Exception during validation:", e);
}

console.log("\n--- Testing with other tool results for comparison ---");

const statusResult = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        scene_id: "test",
        status: "completed",
        progress: 100,
        error_message: null,
        objects: [],
        composition: null,
      }),
    },
  ],
};

try {
  const result = z4mini.safeParse(CallToolResultSchema, statusResult);
  console.log("\nStatus result validation:");
  console.log("  success:", result.success);
  if (!result.success) {
    console.log("  error:", JSON.stringify(result.error, null, 2));
  }
} catch (e) {
  console.error("Exception during status validation:", e);
}
