namespace Orleans.Sidecar.Configuration;

public static class DatabaseConfiguration
{
    public static string GetConnectionString(IConfiguration configuration)
    {
        // Prioritize environment variable over appsettings.json
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? configuration.GetConnectionString("DefaultConnection");

        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException(
                "Database connection string not found. Set 'DATABASE_URL' environment variable or 'ConnectionStrings:DefaultConnection' in appsettings.json.");
        }

        // Convert PostgreSQL URI format to Npgsql connection string if needed
        if (connectionString.StartsWith("postgresql://") || connectionString.StartsWith("postgres://"))
        {
            connectionString = ConvertPostgresUriToConnectionString(connectionString);
        }

        return connectionString;
    }

    private static string ConvertPostgresUriToConnectionString(string uri)
    {
        var parsedUri = new Uri(uri);
        var userInfo = parsedUri.UserInfo.Split(':');
        var port = parsedUri.Port > 0 ? parsedUri.Port : 5432;

        var builder = new System.Text.StringBuilder();
        builder.Append($"Host={parsedUri.Host};");
        builder.Append($"Port={port};");
        builder.Append($"Database={parsedUri.AbsolutePath.TrimStart('/')};");
        builder.Append($"Username={userInfo[0]};");
        builder.Append($"Password={userInfo[1]}");

        // Add query parameters
        if (!string.IsNullOrEmpty(parsedUri.Query))
        {
            var queryParams = System.Web.HttpUtility.ParseQueryString(parsedUri.Query);
            if (queryParams["sslmode"] != null)
                builder.Append($";SSL Mode={queryParams["sslmode"]}");
            if (queryParams["channel_binding"] != null)
                builder.Append($";Channel Binding={queryParams["channel_binding"]}");
        }

        return builder.ToString();
    }
}
