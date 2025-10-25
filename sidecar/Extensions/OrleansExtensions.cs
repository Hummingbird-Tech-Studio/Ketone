using Orleans.Sidecar.Configuration;
using Orleans.Streams;

namespace Orleans.Sidecar.Extensions;

public static class OrleansExtensions
{
    public static IHostBuilder AddOrleansServices(this IHostBuilder builder, IConfiguration configuration)
    {
        builder.UseOrleans((context, siloBuilder) =>
        {
            var connectionString = DatabaseConfiguration.GetConnectionString(configuration);

            // Configure localhost clustering for development
            siloBuilder.UseLocalhostClustering();

            // Configure grain storage with PostgreSQL
            siloBuilder.AddAdoNetGrainStorage("actorState", options =>
            {
                options.Invariant = "Npgsql";
                options.ConnectionString = connectionString;
            });

            // Configure Orleans Streams for pub/sub pattern
            // Using simple message streams (in-memory, no persistence required, can switch to persistent streams later)
            siloBuilder.AddMemoryStreams("CycleEventsStream", options =>
            {
                options.ConfigureStreamPubSub(StreamPubSubType.ImplicitOnly);
            });
        });

        return builder;
    }
}
