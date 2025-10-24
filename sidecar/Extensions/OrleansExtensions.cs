using Orleans.Sidecar.Configuration;

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
        });

        return builder;
    }
}
