namespace Orleans.Sidecar;

/// <summary>
/// Interface for UserAuth Grain - manages user authentication state in memory
/// Tracks password change timestamps for fast token invalidation checks
/// </summary>
public interface IUserAuthGrain : IGrainWithStringKey
{
    /// <summary>
    /// Gets the timestamp (Unix seconds) when the user's password was last changed
    /// Returns null if never changed or user doesn't exist
    /// </summary>
    Task<long?> GetPasswordChangedAt();

    /// <summary>
    /// Updates the password change timestamp to the current time
    /// Used when a user changes their password
    /// Returns the new timestamp
    /// </summary>
    Task<long> SetPasswordChangedAt(long timestamp);

    /// <summary>
    /// Checks if a token issued at the given timestamp is still valid
    /// Returns true if the token is valid (issued after last password change)
    /// Returns false if the token should be invalidated
    /// </summary>
    Task<bool> IsTokenValid(long tokenIssuedAt);
}
