using Npgsql;
using Orleans.Streams;
using Orleans.Sidecar.Configuration;

namespace Orleans.Sidecar;

/// <summary>
/// Grain that tracks the last completed cycle for an actor
/// Uses Orleans Streams to subscribe to cycle events (Observer Pattern)
/// Implements implicit subscription via namespace
/// </summary>
[ImplicitStreamSubscription("cycles")]
public class LastCompletedCycleGrain(
    [PersistentState("lastCompletedCycle", "actorState")] IPersistentState<LastCompletedCycleState> state,
    ILogger<LastCompletedCycleGrain> logger,
    IConfiguration configuration
) : Grain, ILastCompletedCycleGrain
{
    private readonly IPersistentState<LastCompletedCycleState> _state = state ?? throw new ArgumentNullException(nameof(state));
    private readonly ILogger<LastCompletedCycleGrain> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IConfiguration _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
    private StreamSubscriptionHandle<ICycleEvent>? _streamSubscription;

    public override async Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var actorId = this.GetPrimaryKeyString();
        _logger.LogInformation("[LastCompletedCycleGrain] OnActivateAsync for {ActorId}. RecordExists: {RecordExists}",
            actorId, _state.RecordExists);

        // If no state exists in Orleans, try to load from database
        if (!_state.RecordExists || _state.State == null || _state.State.CycleId == null)
        {
            _logger.LogInformation("[LastCompletedCycleGrain] No Orleans state found for {ActorId}, loading from database", actorId);
            await RefreshFromDatabase();
        }
        else
        {
            _logger.LogInformation("[LastCompletedCycleGrain] Loaded existing state for {ActorId}. CycleId: {CycleId}, EndDate: {EndDate}",
                actorId, _state.State.CycleId, _state.State.EndDate);
        }

        // Subscribe to Orleans Stream for this actor's cycle events
        await SubscribeToCycleEvents();

        await base.OnActivateAsync(cancellationToken);
    }

    public override async Task OnDeactivateAsync(DeactivationReason reason, CancellationToken cancellationToken)
    {
        // Unsubscribe from stream when grain deactivates
        if (_streamSubscription != null)
        {
            await _streamSubscription.UnsubscribeAsync();
            _logger.LogInformation("[LastCompletedCycleGrain] Unsubscribed from cycle events stream");
        }

        await base.OnDeactivateAsync(reason, cancellationToken);
    }

    /// <summary>
    /// Subscribe to Orleans Stream for cycle events
    /// This is the Observer Pattern implementation using implicit subscriptions
    /// </summary>
    private async Task SubscribeToCycleEvents()
    {
        var actorId = this.GetPrimaryKeyString();
        
        // Get the stream provider
        var streamProvider = this.GetStreamProvider("CycleEventsStream");
        
        // Get the stream for this actor's cycle events
        var stream = streamProvider.GetStream<ICycleEvent>(
            StreamId.Create("cycles", actorId)
        );

        // Resume all existing subscriptions (implicit subscriptions are auto-created)
        var subscriptions = await stream.GetAllSubscriptionHandles();
        if (subscriptions.Count > 0)
        {
            foreach (var subscription in subscriptions)
            {
                await subscription.ResumeAsync(OnCycleEventReceived);
            }
            _logger.LogInformation("[LastCompletedCycleGrain] Resumed {Count} existing subscriptions for {ActorId}", 
                subscriptions.Count, actorId);
        }
        else
        {
            // If no subscription exists, create one (shouldn't happen with implicit subscriptions)
            _streamSubscription = await stream.SubscribeAsync(OnCycleEventReceived);
            _logger.LogInformation("[LastCompletedCycleGrain] Created new subscription for {ActorId}", actorId);
        }
    }

    /// <summary>
    /// Event handler called when a cycle event is published to the stream
    /// This is the Observer callback
    /// </summary>
    private async Task OnCycleEventReceived(ICycleEvent evt, StreamSequenceToken? token)
    {
        var actorId = this.GetPrimaryKeyString();
        _logger.LogInformation("[LastCompletedCycleGrain] Received event for {ActorId}: {EventType}", 
            actorId, evt.GetType().Name);

        switch (evt)
        {
            case CycleCompletedEvent completed:
                await HandleCycleCompleted(completed);
                break;

            case CycleDeletedEvent deleted:
                await HandleCycleDeleted(deleted);
                break;

            case CycleModifiedEvent modified:
                await HandleCycleModified(modified);
                break;

            default:
                _logger.LogWarning("[LastCompletedCycleGrain] Unknown event type: {EventType}", evt.GetType().Name);
                break;
        }
    }

    /// <summary>
    /// Handle cycle completed event from stream
    /// </summary>
    private async Task HandleCycleCompleted(CycleCompletedEvent evt)
    {
        _logger.LogInformation("[LastCompletedCycleGrain] Handling CycleCompleted: {CycleId}, EndDate: {EndDate}",
            evt.CycleId, evt.EndDate);

        // Only update if this is newer than current
        if (_state.State == null || _state.State.EndDate == null || evt.EndDate > _state.State.EndDate)
        {
            _state.State = new LastCompletedCycleState
            {
                CycleId = evt.CycleId,
                EndDate = evt.EndDate,
                UpdatedAt = DateTime.UtcNow
            };

            await _state.WriteStateAsync();
            _logger.LogInformation("[LastCompletedCycleGrain] Updated last completed cycle to {CycleId}", evt.CycleId);
        }
        else
        {
            _logger.LogInformation("[LastCompletedCycleGrain] Skipped update - existing cycle is newer");
        }
    }

    /// <summary>
    /// Handle cycle deleted event from stream
    /// </summary>
    private async Task HandleCycleDeleted(CycleDeletedEvent evt)
    {
        _logger.LogInformation("[LastCompletedCycleGrain] Handling CycleDeleted: {CycleId}", evt.CycleId);

        // If the deleted cycle was the tracked one, refresh from database
        if (_state.State?.CycleId == evt.CycleId)
        {
            _logger.LogInformation("[LastCompletedCycleGrain] Tracked cycle was deleted, refreshing from database");
            await RefreshFromDatabase();
        }
    }

    /// <summary>
    /// Handle cycle modified event from stream
    /// </summary>
    private async Task HandleCycleModified(CycleModifiedEvent evt)
    {
        _logger.LogInformation("[LastCompletedCycleGrain] Handling CycleModified: {CycleId}, Status: {Status}",
            evt.CycleId, evt.Status);

        // If the modified cycle was the tracked one
        if (_state.State?.CycleId == evt.CycleId)
        {
            if (evt.Status == "completed" && evt.NewEndDate.HasValue)
            {
                // Update the end date
                _state.State.EndDate = evt.NewEndDate.Value;
                _state.State.UpdatedAt = DateTime.UtcNow;
                await _state.WriteStateAsync();
                _logger.LogInformation("[LastCompletedCycleGrain] Updated end date for tracked cycle");
            }
            else
            {
                // No longer completed, refresh from database
                _logger.LogInformation("[LastCompletedCycleGrain] Tracked cycle is no longer completed, refreshing from database");
                await RefreshFromDatabase();
            }
        }
    }

    public Task<LastCompletedCycleState?> GetLastCompleted()
    {
        var actorId = this.GetPrimaryKeyString();
        _logger.LogInformation("[LastCompletedCycleGrain] GetLastCompleted called for {ActorId}", actorId);

        if (!_state.RecordExists || _state.State == null || _state.State.CycleId == null)
        {
            _logger.LogInformation("[LastCompletedCycleGrain] No completed cycle found for {ActorId}", actorId);
            return Task.FromResult<LastCompletedCycleState?>(null);
        }

        return Task.FromResult<LastCompletedCycleState?>(_state.State);
    }


    public async Task RefreshFromDatabase()
    {
        var actorId = this.GetPrimaryKeyString();
        _logger.LogInformation("[LastCompletedCycleGrain] RefreshFromDatabase called for {ActorId}", actorId);

        try
        {
            var connectionString = DatabaseConfiguration.GetConnectionString(_configuration);
            if (string.IsNullOrEmpty(connectionString))
            {
                _logger.LogError("[LastCompletedCycleGrain] Database connection string not configured");
                return;
            }

            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            // Query for the last completed cycle
            // Note: This assumes you have a 'status' column or similar to track completion
            // Adjust the query based on your actual schema
            var query = @"
                SELECT id, end_date
                FROM cycles
                WHERE actor_id = @actorId
                  AND end_date < NOW()
                ORDER BY end_date DESC
                LIMIT 1";

            await using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("actorId", actorId);

            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                var cycleId = reader.GetGuid(0).ToString();
                var endDate = reader.GetDateTime(1);

                _state.State = new LastCompletedCycleState
                {
                    CycleId = cycleId,
                    EndDate = endDate,
                    UpdatedAt = DateTime.UtcNow
                };

                await _state.WriteStateAsync();
                _logger.LogInformation("[LastCompletedCycleGrain] Refreshed from database for {ActorId}. CycleId: {CycleId}, EndDate: {EndDate}",
                    actorId, cycleId, endDate);
            }
            else
            {
                // No completed cycles found
                _state.State = new LastCompletedCycleState
                {
                    CycleId = null,
                    EndDate = null,
                    UpdatedAt = DateTime.UtcNow
                };
                await _state.WriteStateAsync();
                _logger.LogInformation("[LastCompletedCycleGrain] No completed cycles found in database for {ActorId}", actorId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[LastCompletedCycleGrain] Error refreshing from database for {ActorId}", actorId);
            throw;
        }
    }
}
