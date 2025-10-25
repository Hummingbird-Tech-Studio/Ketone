using Orleans.Sidecar;
using Orleans.Sidecar.Extensions;
using DotNetEnv;
using System.Text.Json;
using Orleans.Streams;

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
// LAST COMPLETED CYCLE ENDPOINTS
// ============================================================================

// GET /actors/{actorId}/last-completed - Get last completed cycle info
app.MapGet("/actors/{actorId}/last-completed", async (string actorId, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.LastCompletedEndpoint");
    logger.LogInformation("[GET /actors/{ActorId}/last-completed] Incoming request", actorId);

    var grain = grainFactory.GetGrain<ILastCompletedCycleGrain>(actorId);

    try
    {
        var lastCompleted = await grain.GetLastCompleted();

        if (lastCompleted == null || lastCompleted.CycleId == null)
        {
            logger.LogInformation("[GET /actors/{ActorId}/last-completed] No completed cycle found", actorId);
            return Results.NotFound(new { message = "No completed cycle found", actorId });
        }

        logger.LogInformation("[GET /actors/{ActorId}/last-completed] Returning last completed cycle: {CycleId}", actorId, lastCompleted.CycleId);
        return Results.Ok(lastCompleted);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[GET /actors/{ActorId}/last-completed] Error getting last completed cycle", actorId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("GetLastCompletedCycle");

// POST /events/cycle-completed - Publish cycle completed event to stream
app.MapPost("/events/cycle-completed", async (CycleCompletedEvent evt, IClusterClient clusterClient, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.CycleEventsEndpoint");
    logger.LogInformation("[POST /events/cycle-completed] Publishing event for ActorId: {ActorId}, CycleId: {CycleId}",
        evt.ActorId, evt.CycleId);

    try
    {
        var streamProvider = clusterClient.GetStreamProvider("CycleEventsStream");
        var stream = streamProvider.GetStream<ICycleEvent>(StreamId.Create("cycles", evt.ActorId));
        
        await stream.OnNextAsync(evt);
        
        logger.LogInformation("[POST /events/cycle-completed] Event published successfully");
        return Results.Ok(new { message = "Event published successfully" });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /events/cycle-completed] Error publishing event");
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("PublishCycleCompletedEvent");

// POST /events/cycle-deleted - Publish cycle deleted event to stream
app.MapPost("/events/cycle-deleted", async (CycleDeletedEvent evt, IClusterClient clusterClient, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.CycleEventsEndpoint");
    logger.LogInformation("[POST /events/cycle-deleted] Publishing event for ActorId: {ActorId}, CycleId: {CycleId}",
        evt.ActorId, evt.CycleId);

    try
    {
        var streamProvider = clusterClient.GetStreamProvider("CycleEventsStream");
        var stream = streamProvider.GetStream<ICycleEvent>(StreamId.Create("cycles", evt.ActorId));
        
        await stream.OnNextAsync(evt);
        
        logger.LogInformation("[POST /events/cycle-deleted] Event published successfully");
        return Results.Ok(new { message = "Event published successfully" });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /events/cycle-deleted] Error publishing event");
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("PublishCycleDeletedEvent");

// POST /events/cycle-modified - Publish cycle modified event to stream
app.MapPost("/events/cycle-modified", async (CycleModifiedEvent evt, IClusterClient clusterClient, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.CycleEventsEndpoint");
    logger.LogInformation("[POST /events/cycle-modified] Publishing event for ActorId: {ActorId}, CycleId: {CycleId}",
        evt.ActorId, evt.CycleId);

    try
    {
        var streamProvider = clusterClient.GetStreamProvider("CycleEventsStream");
        var stream = streamProvider.GetStream<ICycleEvent>(StreamId.Create("cycles", evt.ActorId));
        
        await stream.OnNextAsync(evt);
        
        logger.LogInformation("[POST /events/cycle-modified] Event published successfully");
        return Results.Ok(new { message = "Event published successfully" });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /events/cycle-modified] Error publishing event");
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("PublishCycleModifiedEvent");

// POST /actors/{actorId}/last-completed/refresh - Force refresh from database
app.MapPost("/actors/{actorId}/last-completed/refresh", async (string actorId, IGrainFactory grainFactory, ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("Orleans.Sidecar.LastCompletedEndpoint");
    logger.LogInformation("[POST /actors/{ActorId}/last-completed/refresh] Incoming refresh request", actorId);

    var grain = grainFactory.GetGrain<ILastCompletedCycleGrain>(actorId);

    try
    {
        await grain.RefreshFromDatabase();
        var lastCompleted = await grain.GetLastCompleted();
        logger.LogInformation("[POST /actors/{ActorId}/last-completed/refresh] Refresh completed", actorId);
        return Results.Ok(lastCompleted);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "[POST /actors/{ActorId}/last-completed/refresh] Error refreshing from database", actorId);
        return Results.BadRequest(new { error = ex.Message });
    }
})
.WithName("RefreshLastCompletedCycle");

app.Run();

