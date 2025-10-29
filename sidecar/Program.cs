using Orleans.Sidecar;
using Orleans.Sidecar.Extensions;
using DotNetEnv;
using System.Text.Json;

// Load .env file in development - check current directory and parent directory
var currentDir = Directory.GetCurrentDirectory();
var envPath = Path.Combine(currentDir, ".env");
var parentEnvPath = Path.Combine(Directory.GetParent(currentDir)?.FullName ?? currentDir, ".env");

if (File.Exists(envPath))
{
    Env.Load(envPath);
}
else if (File.Exists(parentEnvPath))
{
    Env.Load(parentEnvPath);
}

var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddOpenApi();

// Configure Orleans with PostgreSQL persistence
builder.Host.AddOrleansServices(builder.Configuration);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

// ============================================================================
// ACTOR ENDPOINTS (External Actor State Management)
// ============================================================================

// GET /actors/{actorId} - Get complete XState snapshot
app.MapGet("/actors/{actorId}", async (string actorId, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.ActorEndpoint");
    logger.LogInformation("[GET /actors/{ActorId}] Incoming request to get actor snapshot", actorId);

    var grain = grainFactory.GetGrain<IActorGrain>(actorId);
    logger.LogInformation("[GET /actors/{ActorId}] Actor grain created/retrieved", actorId);

    try
    {
        var snapshotJson = await grain.GetStateJson();

        if (snapshotJson == null)
        {
            logger.LogInformation("[GET /actors/{ActorId}] Actor not found", actorId);
            return Results.NotFound(new { message = "Actor not found", actorId });
        }

        logger.LogInformation("[GET /actors/{ActorId}] Returning complete snapshot", actorId);
        // Return the JSON directly - ASP.NET will pass it through as-is
        return Results.Content(snapshotJson, "application/json");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[GET /actors/{ActorId}] Error getting actor snapshot", actorId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("GetActorState");

// POST /actors/{actorId} - Save complete XState snapshot
app.MapPost("/actors/{actorId}", async (string actorId, HttpContext context, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.ActorEndpoint");
    logger.LogInformation("[POST /actors/{ActorId}] Incoming request to save actor snapshot", actorId);
    logger.LogInformation("[POST /actors/{ActorId}] Content-Type: {ContentType}", actorId, context.Request.ContentType);
    logger.LogInformation("[POST /actors/{ActorId}] Content-Length: {ContentLength}", actorId, context.Request.ContentLength);

    var grain = grainFactory.GetGrain<IActorGrain>(actorId);

    try
    {
        // Read the raw JSON body as string
        using var reader = new StreamReader(context.Request.Body);
        var snapshotJson = await reader.ReadToEndAsync();

        logger.LogInformation("[POST /actors/{ActorId}] Received JSON body (length: {Length}): {Json}",
            actorId, snapshotJson.Length, snapshotJson);

        // Validate it's valid JSON
        var jsonDoc = JsonDocument.Parse(snapshotJson); // Will throw if invalid
        logger.LogInformation("[POST /actors/{ActorId}] JSON is valid. Root element type: {ElementType}",
            actorId, jsonDoc.RootElement.ValueKind);

        logger.LogInformation("[POST /actors/{ActorId}] Calling grain.UpdateStateJson...", actorId);
        var savedJson = await grain.UpdateStateJson(snapshotJson);
        logger.LogInformation("[POST /actors/{ActorId}] Grain returned saved JSON (length: {Length})",
            actorId, savedJson.Length);

        logger.LogInformation("[POST /actors/{ActorId}] Snapshot saved successfully", actorId);
        // Return the JSON directly - ASP.NET will pass it through as-is
        return Results.Content(savedJson, "application/json");
    }
    catch (JsonException ex)
    {
        logger.LogError(ex, "[POST /actors/{ActorId}] Invalid JSON in request body", actorId);
        return Results.BadRequest(new { error = "Invalid JSON in request body" });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /actors/{ActorId}] Error saving actor snapshot", actorId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("UpdateActorState");

// ============================================================================
// USER AUTH ENDPOINTS (Password Change Tracking)
// ============================================================================

// GET /user-auth/{userId}/password-changed-at
app.MapGet("/user-auth/{userId}/password-changed-at", async (string userId, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.UserAuthEndpoint");
    logger.LogInformation("[GET /user-auth/{UserId}/password-changed-at] Incoming request", userId);

    var grain = grainFactory.GetGrain<IUserAuthGrain>(userId);

    try
    {
        var timestamp = await grain.GetPasswordChangedAt();
        logger.LogInformation("[GET /user-auth/{UserId}/password-changed-at] Timestamp: {Timestamp}", userId, timestamp);

        return Results.Ok(new { userId, passwordChangedAt = timestamp });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[GET /user-auth/{UserId}/password-changed-at] Error", userId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("GetPasswordChangedAt");

// POST /user-auth/{userId}/password-changed-at
app.MapPost("/user-auth/{userId}/password-changed-at", async (string userId, long timestamp, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.UserAuthEndpoint");
    logger.LogInformation("[POST /user-auth/{UserId}/password-changed-at] Incoming request with timestamp: {Timestamp}", userId, timestamp);

    var grain = grainFactory.GetGrain<IUserAuthGrain>(userId);

    try
    {
        var savedTimestamp = await grain.SetPasswordChangedAt(timestamp);
        logger.LogInformation("[POST /user-auth/{UserId}/password-changed-at] Timestamp saved: {Timestamp}", userId, savedTimestamp);

        return Results.Ok(new { userId, passwordChangedAt = savedTimestamp });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /user-auth/{UserId}/password-changed-at] Error", userId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("SetPasswordChangedAt");

// POST /user-auth/{userId}/validate-token
app.MapPost("/user-auth/{userId}/validate-token", async (string userId, long tokenIssuedAt, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.UserAuthEndpoint");
    logger.LogInformation("[POST /user-auth/{UserId}/validate-token] Incoming request with iat: {TokenIssuedAt}", userId, tokenIssuedAt);

    var grain = grainFactory.GetGrain<IUserAuthGrain>(userId);

    try
    {
        var isValid = await grain.IsTokenValid(tokenIssuedAt);
        logger.LogInformation("[POST /user-auth/{UserId}/validate-token] Token is valid: {IsValid}", userId, isValid);

        return Results.Ok(new { userId, tokenIssuedAt, isValid });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /user-auth/{UserId}/validate-token] Error", userId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("ValidateToken");

app.Run();

