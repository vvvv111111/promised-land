import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mimoConfig } from "./roomAgent";
import { validateRoomReference } from "./roomReference";
import { decodePetGlb, MAX_PET_GLB_BYTES } from "../../room/petAsset";

const exec = promisify(execFile);
export interface PetJobResult { species: "cat" | "dog"; glb: string; template: string; source?: string; license?: string; appearanceChanged: boolean }
export interface PetJob { id: string; status: "running" | "succeeded" | "failed" | "cancelled"; createdAt: number; result?: PetJobResult; error?: string }
type RunningJob = PetJob & { process?: ChildProcess; settled?: Promise<void> };
// Survives development module reloads. Jobs intentionally belong to this local Node server.
const globals = globalThis as typeof globalThis & { promisedLandPetJobs?: Map<string, RunningJob> };
const jobs = globals.promisedLandPetJobs ??= new Map();
const python = () => process.env.PET_AGENT_PYTHON?.trim() || (existsSync(path.resolve("pet-recognition-generation/.venv/Scripts/python.exe")) ? path.resolve("pet-recognition-generation/.venv/Scripts/python.exe") : "python");
// This is a separately provisioned local library, not a deploy-time file dependency.
const library = () => path.resolve(/* turbopackIgnore: true */ process.env.PET_AGENT_LIBRARY?.trim() || ".pet-library");
const cache = () => path.resolve(process.cwd(), ".pet-agent");
export class PetAgentError extends Error { constructor(message: string, public status = 400) { super(message); } }

export async function petAgentStatus() {
  const libraryAvailable = existsSync(path.join(library(), "outputs/Pet_Model_Selection_Room/sources.json"));
  const base = { libraryAvailable };
  try { mimoConfig(); } catch { return { ...base, configured: false, message: "照片识别暂不可用；可以直接选择已有模型。" }; }
  try { await access(path.join(library(), "outputs/Pet_Model_Selection/sources.json")); }
  catch { return { ...base, configured: false, message: "宠物素材库尚未配置，请设置 PET_AGENT_LIBRARY。" }; }
  try { await exec(python(), ["-B", "-c", "import sys; assert sys.version_info >= (3, 10); from websockets.sync.client import connect"], { timeout: 10_000, windowsHide: true }); }
  catch { return { ...base, configured: false, message: "宠物生成需要 Python 3.10+ 和 requirements.txt 中的依赖。" }; }
  try { await access(process.env.PET_AGENT_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe"); }
  catch { return { ...base, configured: false, message: "未找到生成预览需要的 Chrome，请设置 PET_AGENT_CHROME。" }; }
  let primaryAvailable = true;
  try { await Promise.all(["server.py", "storage.py"].map(p => access(path.join(library(), "outputs/PetStudio", p)))); } catch { primaryAvailable = false; }
  return { ...base, configured: true, primaryAvailable, message: primaryAvailable ? "" : "当前按照片匹配四款模型，保留模型原有毛色和静态姿态。" };
}

export async function selectLibraryPet(id: unknown): Promise<PetJobResult> {
  if (typeof id !== "string" || !["cat", "kitten", "dog", "puppy"].includes(id)) throw new PetAgentError("请选择已有猫狗模型。");
  const selection = path.join(library(), "outputs/Pet_Model_Selection_Room");
  try {
    const sources = JSON.parse(await readFile(path.join(selection, "sources.json"), "utf8"));
    const asset = sources.find((row: { id: string }) => row.id === id);
    const model = path.join(selection, id + ".glb");
    if (!asset || (await stat(model)).size > MAX_PET_GLB_BYTES) throw Error("asset unavailable");
    const bytes = await readFile(model);
    const { createHash } = await import("node:crypto");
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw Error("hash mismatch");
    const glb = bytes.toString("base64"); decodePetGlb(glb);
    return { species: id === "cat" || id === "kitten" ? "cat" : "dog", template: id, glb, appearanceChanged: false, source: asset.source, license: asset.license };
  } catch { throw new PetAgentError("本地模型不可用，请先准备宠物素材库。", 503); }
}

function stopTree(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => child.kill());
  } else child.kill("SIGTERM");
}

function publicJob(job: PetJob): PetJob {
  return { id: job.id, createdAt: job.createdAt, status: job.status, ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) };
}

export async function startPetJob(image: unknown) {
  validateRoomReference(image);
  const status = await petAgentStatus();
  if (!status.configured) throw new PetAgentError(status.message, 503);
  if ([...jobs.values()].some(j => j.status === "running" || j.process)) throw new PetAgentError("已有宠物正在生成，请等待完成或取消后重试。", 429);
  // Drop expired in-memory results; no permanent photo/model cache on the server.
  for (const [id, job] of jobs) if (Date.now() - job.createdAt > 30 * 60_000) jobs.delete(id);
  const job: RunningJob = { id: randomUUID(), createdAt: Date.now(), status: "running" };
  jobs.set(job.id, job);
  job.settled = runPetJob(job, image);
  return publicJob(job);
}

async function runPetJob(job: RunningJob, image: string) {
  let directory: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await mkdir(cache(), { recursive: true });
    directory = await mkdtemp(path.join(cache(), "job-"));
    const photo = path.join(directory, "input.jpg");
    await writeFile(photo, Buffer.from(image.slice(image.indexOf(",") + 1), "base64"));
    if (job.status !== "running") return;
    const config = mimoConfig();
    const args = ["-B", "-X", "utf8", path.resolve("pet-recognition-generation/agent.py"), photo, "--library", library(), "--output-dir", directory];
    if (process.env.PET_AGENT_CHROME) args.push("--chrome", process.env.PET_AGENT_CHROME);
    const child = spawn(python(), args, { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MIMO_API_KEY: config.key, MIMO_MODEL: process.env.PET_MIMO_MODEL?.trim() || config.model, MIMO_BASE_URL: config.endpoint.replace(/\/chat\/completions$/, "") } });
    job.process = child;
    let output = "", errorText = "";
    child.stdout?.on("data", chunk => { if (output.length < 64_000) output += String(chunk); });
    child.stderr?.on("data", chunk => { if (errorText.length < 64_000) errorText += String(chunk); });
    timer = setTimeout(() => { if (job.status === "running") { job.status = "failed"; job.error = "宠物生成超时，请重试。"; stopTree(child); } }, 240_000);
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    job.process = undefined;
    if (job.status !== "running") return;
    // Never return subprocess logs: they can include paths, account data or credentials.
    if (code !== 0) {
      const auth = /HTTP (401|403)/.test(errorText), rate = /HTTP 429/.test(errorText);
      throw new PetAgentError(auth ? "宠物识别鉴权失败，请检查 MiMo 配置。" : rate ? "MiMo 请求过于频繁或额度不足，请稍后重试。" : "宠物生成失败，请检查素材库、模型和预览环境后重试。");
    }
    const summary = JSON.parse(output.trim().split(/\r?\n/).at(-1) || "null");
    if (!summary || !["generated", "fallback_selected"].includes(summary.status) || !["cat", "dog"].includes(summary.species)) throw new PetAgentError("照片中没有识别到可用的猫狗模型，请换一张清晰的单只宠物照片。");
    const run = path.resolve(summary.run);
    if (path.dirname(run) !== directory) throw new PetAgentError("宠物导出位置无效。");
    const modelPath = path.join(run, "pet.glb");
    if ((await stat(modelPath)).size > MAX_PET_GLB_BYTES) throw new PetAgentError("宠物模型超过 2.5MB，请先简化素材库模型或贴图。");
    const data = await readFile(modelPath), glb = data.toString("base64"); decodePetGlb(glb);
    // Both template/fallback exporters supply a digest; verify before delivering.
    const { createHash } = await import("node:crypto");
    if (createHash("sha256").update(data).digest("hex") !== summary.sha256) throw new PetAgentError("宠物模型完整性校验失败。");
    job.result = { species: summary.species, glb, template: String(summary.template), appearanceChanged: summary.appearance_changed === true, ...(typeof summary.source === "string" ? { source: summary.source } : {}), ...(typeof summary.license === "string" ? { license: summary.license } : {}) };
    job.status = "succeeded";
  } catch (error) {
    if (job.status === "running") { job.status = "failed"; job.error = error instanceof PetAgentError ? error.message : "宠物生成未能完成，请检查配置后重试。"; }
  } finally {
    if (timer) clearTimeout(timer);
    job.process = undefined;
    if (directory && path.dirname(path.resolve(directory)) === cache()) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export function getPetJob(id: string) {
  const job = jobs.get(id);
  if (!job || Date.now() - job.createdAt > 30 * 60_000) throw new PetAgentError("生成记录已过期或服务已重启，请重新生成。", 404);
  return publicJob(job);
}

export async function cancelPetJob(id: string) {
  const job = jobs.get(id);
  if (!job) throw new PetAgentError("生成记录不存在。", 404);
  if (job.status === "running") { job.status = "cancelled"; stopTree(job.process); await job.settled; }
  return publicJob(job);
}
