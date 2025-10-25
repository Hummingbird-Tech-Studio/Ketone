namespace Orleans.Sidecar;

/// <summary>
/// Grain interface for tracking the last completed cycle per actor
/// Uses Orleans Streams to subscribe to cycle events
/// </summary>
public interface ILastCompletedCycleGrain : IGrainWithStringKey
{
    /// <summary>
    /// Get the last completed cycle information
    /// Returns null if no completed cycle exists
    /// </summary>
    Task<LastCompletedCycleState?> GetLastCompleted();

    /// <summary>
    /// Force refresh from database (fallback when cache is stale)
    /// </summary>
    Task RefreshFromDatabase();
}

/// <summary>
/// State stored for last completed cycle
/// </summary>
[GenerateSerializer]
public class LastCompletedCycleState
{
    [Id(0)]
    public string? CycleId { get; set; }
    
    [Id(1)]
    public DateTime? EndDate { get; set; }
    
    [Id(2)]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Base interface for cycle events published to Orleans Streams
/// </summary>
public interface ICycleEvent
{
    string ActorId { get; }
    string CycleId { get; }
}

/// <summary>
/// Event published when a cycle is completed
/// </summary>
[GenerateSerializer]
public record CycleCompletedEvent(
    [property: Id(0)] string ActorId,
    [property: Id(1)] string CycleId,
    [property: Id(2)] DateTime EndDate
) : ICycleEvent;

/// <summary>
/// Event published when a cycle is deleted
/// </summary>
[GenerateSerializer]
public record CycleDeletedEvent(
    [property: Id(0)] string ActorId,
    [property: Id(1)] string CycleId
) : ICycleEvent;

/// <summary>
/// Event published when a cycle is modified
/// </summary>
[GenerateSerializer]
public record CycleModifiedEvent(
    [property: Id(0)] string ActorId,
    [property: Id(1)] string CycleId,
    [property: Id(2)] DateTime? NewEndDate,
    [property: Id(3)] string Status
) : ICycleEvent;
