import * as unzipper from 'unzipper';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Credentials } from '../authentication';
import { logger } from '../logging';
import { tmpDir } from '../run-queries';
import { RemoteQueryWorkflowResult } from './remote-query-workflow-result';
import { DownloadLink } from './download-link';
import { RemoteQuery } from './remote-query';
import { RemoteQueryResultIndex, RemoteQueryResultIndexItem } from './remote-query-result-index';
import { AsyncValueResult, ValueResult } from '../result';

interface ApiResultIndexItem {
  nwo: string;
  id: string;
  results_count: number;
  bqrs_file_size: number;
  sarif_file_size?: number;
}

interface ApiArtifact {
  id: number;
  node_id: string;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  expires_at: string;
  updated_at: string;
}

export async function getRemoteQueryIndex(
  credentials: Credentials,
  remoteQuery: RemoteQuery
): AsyncValueResult<RemoteQueryResultIndex> {
  const controllerRepo = remoteQuery.controllerRepository;
  const owner = controllerRepo.owner;
  const repoName = controllerRepo.name;
  const workflowRunId = remoteQuery.actionsWorkflowRunId;

  const workflowUri = `https://github.com/${owner}/${repoName}/actions/runs/${workflowRunId}`;
  const artifactsUrlPath = `/repos/${owner}/${repoName}/actions/artifacts`;

  const artifactListResult = await listWorkflowRunArtifacts(credentials, owner, repoName, workflowRunId);
  if (artifactListResult.isErr) {
    return ValueResult.fail(artifactListResult.error);
  }
  const artifactList = artifactListResult.value;

  const resultIndexArtifactId = tryGetArtifactIDfromName('result-index', artifactList);
  if (!resultIndexArtifactId) {
    return ValueResult.fail(`Could not find artifact with name "result-index" in workflow ${workflowUri}.
        Please check whether the workflow run has successfully completed.`);
  }

  const indexItemsResult = await getResultIndexItems(credentials, owner, repoName, resultIndexArtifactId);
  if (indexItemsResult.isErr) {
    return ValueResult.fail(indexItemsResult.error);
  }

  const indexItems = indexItemsResult.value;

  const allResultsArtifactId = tryGetArtifactIDfromName('all-results', artifactList);
  if (!allResultsArtifactId) {
    return ValueResult.fail(`Could not find artifact with name "all-results" in workflow ${workflowUri}.`);
  }

  const items = [];
  for (const item of indexItems) {
    const artifactId = tryGetArtifactIDfromName(item.id, artifactList);
    if (!artifactId) {
      return ValueResult.fail(`Could not find artifact with name "${item.id}" in workflow ${workflowUri}.`);
    }

    items.push({
      id: item.id.toString(),
      artifactId: artifactId,
      nwo: item.nwo,
      resultCount: item.results_count,
      bqrsFileSize: item.bqrs_file_size,
      sarifFileSize: item.sarif_file_size,
    } as RemoteQueryResultIndexItem);
  }

  return ValueResult.ok({
    allResultsArtifactId,
    artifactsUrlPath,
    items,
  });
}

export async function downloadArtifactFromLink(
  credentials: Credentials,
  downloadLink: DownloadLink
): AsyncValueResult<string> {
  const octokit = await credentials.getOctokit();

  // Download the zipped artifact.
  let data: ArrayBuffer;
  try {
    const response = await octokit.request(`GET ${downloadLink.urlPath}/zip`, {});
    data = response.data;
  }
  catch (error) {
    const errorMsg = (error as Error).message;
    return ValueResult.fail(`Could not download artifact. Error ${errorMsg}`);
  }

  const zipFilePath = path.join(tmpDir.name, `${downloadLink.id}.zip`);
  await saveFile(`${zipFilePath}`, data);

  // Extract the zipped artifact.
  const extractedPath = path.join(tmpDir.name, downloadLink.id);
  await unzipFile(zipFilePath, extractedPath);

  const result = downloadLink.innerFilePath
    ? path.join(extractedPath, downloadLink.innerFilePath)
    : extractedPath;

  return ValueResult.ok(result);
}

/**
 * Downloads the result index artifact and extracts the result index items.
 * @param credentials Credentials for authenticating to the GitHub API.
 * @param owner
 * @param repo
 * @param workflowRunId The ID of the workflow run to get the result index for.
 * @returns An object containing the result index.
 */
async function getResultIndexItems(
  credentials: Credentials,
  owner: string,
  repo: string,
  artifactId: number
): AsyncValueResult<ApiResultIndexItem[]> {
  const downloadResult = await downloadArtifact(credentials, owner, repo, artifactId);
  if (downloadResult.isErr) {
    return ValueResult.fail(downloadResult.error);
  }

  const artifactPath = downloadResult.value;

  const indexFilePath = path.join(artifactPath, 'index.json');
  if (!(await fs.pathExists(indexFilePath))) {
    return ValueResult.fail('Could not find index.json file in the result artifact');
  }

  const resultIndex = await fs.readFile(path.join(artifactPath, 'index.json'), 'utf8');

  try {
    return JSON.parse(resultIndex);
  } catch (error) {
    const errorMsg = (error as Error).message;
    return ValueResult.fail(`Invalid result index file: ${errorMsg}`);
  }
}

/**
 * Gets the status of a workflow run.
 * @param credentials Credentials for authenticating to the GitHub API.
 * @param owner 
 * @param repo 
 * @param workflowRunId The ID of the workflow run to get the result index for.
 * @returns The workflow run status.
 */
export async function getWorkflowStatus(
  credentials: Credentials,
  owner: string,
  repo: string,
  workflowRunId: number): Promise<RemoteQueryWorkflowResult> {
  const octokit = await credentials.getOctokit();

  const workflowRun = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: workflowRunId
  });

  if (workflowRun.data.status === 'completed') {
    if (workflowRun.data.conclusion === 'success') {
      return { status: 'CompletedSuccessfully' };
    } else {
      const error = getWorkflowError(workflowRun.data.conclusion);
      return { status: 'CompletedUnsuccessfully', error };
    }
  }

  return { status: 'InProgress' };
}

/**
 * Lists the workflow run artifacts for the given workflow run ID.
 * @param credentials Credentials for authenticating to the GitHub API.
 * @param owner
 * @param repo
 * @param workflowRunId The ID of the workflow run to list artifacts for.
 * @returns An array of artifact details (including artifact name and ID).
 */
async function listWorkflowRunArtifacts(
  credentials: Credentials,
  owner: string,
  repo: string,
  workflowRunId: number
): AsyncValueResult<ApiArtifact[]> {
  const octokit = await credentials.getOctokit();
  try {
    const response = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: workflowRunId,
    });

    return ValueResult.ok(response.data.artifacts);
  }
  catch (error) {
    return ValueResult.fail((error as Error).message);
  }
}

/**
 * @param artifactName The artifact name, as a string.
 * @param artifacts An array of artifact details (from the "list workflow run artifacts" API response).
 * @returns The artifact ID corresponding to the given artifact name.
 */
function tryGetArtifactIDfromName(
  artifactName: string,
  artifacts: Array<{ id: number, name: string }>
): number | undefined {
  const artifact = artifacts.find(a => a.name === artifactName);
  return artifact?.id;
}

/**
 * Downloads an artifact from a workflow run.
 * @param credentials Credentials for authenticating to the GitHub API.
 * @param owner
 * @param repo
 * @param artifactId The ID of the artifact to download.
 * @returns The path to the enclosing directory of the unzipped artifact.
 */
async function downloadArtifact(
  credentials: Credentials,
  owner: string,
  repo: string,
  artifactId: number
): AsyncValueResult<string> {
  const octokit = await credentials.getOctokit();
  let data: ArrayBuffer;

  try {
    const response = await octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifactId,
      archive_format: 'zip',
    });
    data = response.data as ArrayBuffer;
  }
  catch (error) {
    return ValueResult.fail((error as Error).message);
  }

  const artifactPath = path.join(tmpDir.name, `${artifactId}`);
  await saveFile(`${artifactPath}.zip`, data);
  await unzipFile(`${artifactPath}.zip`, artifactPath);

  return ValueResult.ok(artifactPath);
}

async function saveFile(filePath: string, data: ArrayBuffer): Promise<void> {
  void logger.log(`Saving file to ${filePath}`);
  await fs.writeFile(filePath, Buffer.from(data));
}

async function unzipFile(sourcePath: string, destinationPath: string) {
  void logger.log(`Unzipping file to ${destinationPath}`);
  const file = await unzipper.Open.file(sourcePath);
  await file.extract({ path: destinationPath });
}

function getWorkflowError(conclusion: string | null): string {
  if (!conclusion) {
    return 'Workflow finished without a conclusion';
  }

  if (conclusion === 'cancelled') {
    return 'The remote query execution was cancelled.';
  }

  if (conclusion === 'timed_out') {
    return 'The remote query execution timed out.';
  }

  if (conclusion === 'failure') {
    // TODO: Get the actual error from the workflow or potentially
    // from an artifact from the action itself.
    return 'The remote query execution has failed.';
  }

  return `Unexpected query execution conclusion: ${conclusion}`;
}
