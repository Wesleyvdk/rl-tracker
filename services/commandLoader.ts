import fs from "node:fs";
import path from "node:path";
import type { Command } from "../types";

export async function loadCommands(): Promise<Command[]> {
  const commands: Command[] = [];
  const root = path.join(import.meta.dir, "..", "commands");
  for (const folder of fs.readdirSync(root)) {
    for (const file of fs
      .readdirSync(path.join(root, folder))
      .filter((file) => file.endsWith(".ts"))) {
      const command = await import(path.join(root, folder, file));
      if (!command.data || typeof command.execute !== "function")
        throw new Error(`Invalid command: ${file}`);
      commands.push({ data: command.data.toJSON(), execute: command.execute });
    }
  }
  return commands;
}
