import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.RUNTIME_NODE_MODULES = "C:\\Program Files\\WindowsApps\\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\\dependencies\\node\\node_modules";
const workspaceDir = "C:\\Users\\miran\\OneDrive\\Documentos\\COLEGIOS";
const skillDir = "C:\\Users\\miran\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.1105.12137\\skills\\presentations";
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath: path.join(workspaceDir, ".codex-build/staging/candidate.pptx"),
  finalPath: path.join(workspaceDir, "entregables/EDUCA-presentacion-colegios.pptx"),
  pythonExecutable: "C:\\Program Files\\WindowsApps\\OpenAI.CodexPrimaryRuntime.v26-1105-1297-0_26.1105.1297.0_x64__3k8sg7r9htsxt\\dependencies\\python\\python.exe",
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit"],
  explicitTotalSlideCount: 11,
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: "design", families: ["Arial"] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, ".codex-build/staging/validation-v2.json")
});
console.log(JSON.stringify(result));
