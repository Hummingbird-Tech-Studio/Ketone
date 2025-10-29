using Orleans.Runtime;

namespace Orleans.Sidecar;

/// <summary>
/// UserAuth Grain State - stored in Orleans persistence
/// </summary>
[GenerateSerializer]
public class UserAuthState
{
    /// <summary>
    /// Unix timestamp (seconds) when password was last changed
    /// Null if never changed
    /// </summary>
    [Id(0)]
    public long? PasswordChangedAt { get; set; }
}

/// <summary>
/// UserAuth Grain Implementation
/// Stores password change timestamps in memory for fast token validation
/// One grain per user (keyed by userId)
/// </summary>
public class UserAuthGrain : Grain, IUserAuthGrain
{
    private readonly IPersistentState<UserAuthState> _state;
    private readonly ILogger<UserAuthGrain> _logger;

    public UserAuthGrain(
        [PersistentState("userAuth", "authStore")] IPersistentState<UserAuthState> state,
        ILogger<UserAuthGrain> logger)
    {
        _state = state;
        _logger = logger;
    }

    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        var userId = this.GetPrimaryKeyString();
        _logger.LogInformation("[UserAuthGrain:{UserId}] Activated", userId);
        return base.OnActivateAsync(cancellationToken);
    }

    public Task<long?> GetPasswordChangedAt()
    {
        var userId = this.GetPrimaryKeyString();
        _logger.LogInformation("[UserAuthGrain:{UserId}] GetPasswordChangedAt -> {Timestamp}",
            userId, _state.State.PasswordChangedAt);

        return Task.FromResult(_state.State.PasswordChangedAt);
    }

    public async Task<long> SetPasswordChangedAt(long timestamp)
    {
        var userId = this.GetPrimaryKeyString();
        _logger.LogInformation("[UserAuthGrain:{UserId}] SetPasswordChangedAt: {Timestamp}",
            userId, timestamp);

        _state.State.PasswordChangedAt = timestamp;
        await _state.WriteStateAsync();

        _logger.LogInformation("[UserAuthGrain:{UserId}] Password change timestamp saved", userId);
        return timestamp;
    }

    public Task<bool> IsTokenValid(long tokenIssuedAt)
    {
        var userId = this.GetPrimaryKeyString();
        var passwordChangedAt = _state.State.PasswordChangedAt;

        // If password was never changed, token is valid
        if (passwordChangedAt == null)
        {
            _logger.LogInformation("[UserAuthGrain:{UserId}] IsTokenValid: true (never changed)", userId);
            return Task.FromResult(true);
        }

        // Token is valid if it was issued AFTER the password was changed
        var isValid = tokenIssuedAt >= passwordChangedAt.Value;

        _logger.LogInformation(
            "[UserAuthGrain:{UserId}] IsTokenValid: {IsValid} (iat={TokenIat}, passwordChangedAt={PasswordChangedAt})",
            userId, isValid, tokenIssuedAt, passwordChangedAt.Value);

        return Task.FromResult(isValid);
    }
}
