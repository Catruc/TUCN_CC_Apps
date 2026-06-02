const {
  authenticate,
  jsonResponseWithCorrelation,
  normalizeError,
  preflightResponse,
} = require("../shared/auth");
const { emit, finishRequest, maskDeviceId, startRequest } = require("../shared/logging");
const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

// Citeste CSV-ul din Azure Blob Storage
// Returneaza un array de obiecte: [{ device_id, value, location, status }, ...]
async function loadDataFromBlob() {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const containerName = process.env.DATASETS_CONTAINER_NAME || "datasets";

  // DefaultAzureCredential foloseste managed identity in Azure
  // (nu ai nevoie de parole sau connection strings)
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient("devices.csv");

  // Descarca continutul CSV-ului ca text
  const downloadResponse = await blobClient.download();
  const chunks = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }
  const csvText = Buffer.concat(chunks).toString("utf-8");

  // Parseaza CSV-ul linie cu linie
  // Prima linie e header: device_id,value,location,status
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const data = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj = {};
    headers.forEach((header, i) => {
      // Converteste "value" la numar, restul raman string
      obj[header] = header === "value" ? Number(values[i]) : values[i];
    });
    return obj;
  });

  return data;
}

module.exports = async function data(context, req) {
  const request = startRequest(context, req, "/api/data");

  if (req.method === "OPTIONS") {
    context.res = preflightResponse(request.correlationId);
    finishRequest(context, request, 204);
    return;
  }

  try {
    const auth = await authenticate(req);
    const { role, device_id } = auth.claims;

    // Incarca datele din Azure Blob Storage
    const allData = await loadDataFromBlob();

    let visibleData;

    if (role === "admin") {
      // Admin vede toate datele
      visibleData = allData;
    } else if (role === "user") {
      if (!device_id) {
        emit(context, "warn", "authz.denied", {
          correlationId: request.correlationId,
          path: "/api/data",
          code: "missing_device_id",
          role,
        });
        context.res = jsonResponseWithCorrelation(
          403,
          { error: "No device_id associated with this account" },
          request.correlationId
        );
        finishRequest(context, request, 403);
        return;
      }
      // User vede doar datele pentru device-ul sau
      visibleData = allData.filter((item) => item.device_id === device_id);
    } else {
      emit(context, "warn", "authz.denied", {
        correlationId: request.correlationId,
        path: "/api/data",
        code: "unknown_role",
        role,
      });
      context.res = jsonResponseWithCorrelation(
        403,
        { error: "Insufficient permissions" },
        request.correlationId
      );
      finishRequest(context, request, 403);
      return;
    }

    emit(context, "info", "authz.allowed", {
      correlationId: request.correlationId,
      path: "/api/data",
      role,
      deviceIdMasked: maskDeviceId(device_id),
      returnedCount: visibleData.length,
    });

    context.res = jsonResponseWithCorrelation(
      200,
      { role, device_id, data: visibleData },
      request.correlationId
    );
    finishRequest(context, request, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    emit(context, normalized.status >= 500 ? "error" : "warn", "auth.failed", {
      correlationId: request.correlationId,
      path: "/api/data",
      code: normalized.code,
      reason: normalized.logMessage,
    });
    context.res = jsonResponseWithCorrelation(
      normalized.status,
      { error: normalized.clientMessage },
      request.correlationId
    );
    finishRequest(context, request, normalized.status);
  }
};