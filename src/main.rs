use std::{env, fs::File, net::SocketAddr, time::Duration};

use anyhow::{Context, Result};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tokio::time;
use tower_http::services::ServeDir;
use web_push::{
    ContentEncoding, IsahcWebPushClient, SubscriptionInfo, VapidSignatureBuilder,
    WebPushClient, WebPushMessageBuilder,
};

const AIRPORTS: [&str; 7] = ["NBO", "WIL", "MBA", "UKA", "MYD", "KIS", "EDL"];

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    http: Client,
    push: Option<PushConfig>,
}

#[derive(Clone)]
struct PushConfig {
    client: IsahcWebPushClient,
    private_key_file: String,
    subject: String,
}

#[derive(Debug, Deserialize)]
struct Feed {
    fares: Vec<IncomingFare>,
}

#[derive(Debug, Deserialize)]
struct IncomingFare {
    origin: String,
    destination: String,
    carrier: String,
    departure: DateTime<Utc>,
    price_kes: i64,
}

#[derive(Debug, Deserialize)]
struct FareQuery {
    origin: Option<String>,
    destination: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SubscriptionRequest {
    endpoint: String,
    keys: SubscriptionKeys,
}

#[derive(Debug, Deserialize)]
struct SubscriptionKeys {
    p256dh: String,
    auth: String,
}

#[derive(Debug, Deserialize)]
struct UnsubscribeRequest {
    endpoint: String,
}

#[derive(Debug, Serialize)]
struct FareView {
    origin: String,
    destination: String,
    carrier: String,
    departure: String,
    price_kes: i64,
    median_60d_kes: Option<i64>,
    below_median: bool,
}

#[derive(Debug, Serialize)]
struct RouteView {
    origin: &'static str,
    destination: &'static str,
}

#[derive(Debug)]
struct ApiError(StatusCode, anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        eprintln!("request failed: {:#}", self.1);
        (self.0, "request failed").into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, error)
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, error.into())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://flights.db?mode=rwc".to_owned());
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .with_context(|| format!("could not open SQLite database {database_url}"))?;
    sqlx::migrate!().run(&db).await?;

    let http = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("KenyaFlightWatch/0.1")
        .build()?;
    let push = match (
        env::var("VAPID_PRIVATE_KEY_FILE").ok(),
        env::var("VAPID_PUBLIC_KEY").ok(),
    ) {
        (Some(private_key_file), Some(_)) => Some(PushConfig {
            client: IsahcWebPushClient::new()?,
            private_key_file,
            subject: env::var("VAPID_SUBJECT")
                .unwrap_or_else(|_| "mailto:admin@example.com".to_owned()),
        }),
        _ => None,
    };
    if push.is_none() {
        eprintln!("Web Push disabled; configure both VAPID key variables to enable it.");
    }

    let state = AppState { db, http, push };
    tokio::spawn(collector_loop(state.clone()));
    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/routes", get(routes))
        .route("/api/fares", get(fares))
        .route("/api/subscriptions", post(subscribe).delete(unsubscribe))
        .route("/vapid-public-key", get(vapid_public_key))
        .fallback_service(ServeDir::new("web").append_index_html_on_directories(true))
        .with_state(state);

    let address: SocketAddr = env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse()
        .context("BIND_ADDR must be a socket address such as 127.0.0.1:8080")?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Kenya Flight Watch listening at http://{address}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn routes() -> Json<Vec<RouteView>> {
    Json(
        ["NBO", "WIL"]
            .into_iter()
            .flat_map(|origin| {
                ["MBA", "UKA", "MYD", "KIS", "EDL"]
                    .into_iter()
                    .map(move |destination| RouteView {
                        origin,
                        destination,
                    })
            })
            .collect(),
    )
}

async fn fares(
    State(state): State<AppState>,
    Query(query): Query<FareQuery>,
) -> Result<Json<Vec<FareView>>, ApiError> {
    if let Some(code) = query.origin.as_deref() {
        validate_airport(code)?;
    }
    if let Some(code) = query.destination.as_deref() {
        validate_airport(code)?;
    }
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT origin, destination, carrier, departure, price_kes FROM fares
         WHERE julianday(departure) >= julianday('now', '-60 days')
           AND (?1 IS NULL OR origin = ?1) AND (?2 IS NULL OR destination = ?2)
         ORDER BY price_kes, departure",
    )
    .bind(query.origin.map(|value| value.to_ascii_uppercase()))
    .bind(query.destination.map(|value| value.to_ascii_uppercase()))
    .fetch_all(&state.db)
    .await?;

    let mut medians = std::collections::HashMap::new();
    let mut fares = Vec::with_capacity(rows.len());
    for (origin, destination, carrier, departure, price_kes) in rows {
        let route = (origin.clone(), destination.clone());
        let median = if let Some(median) = medians.get(&route) {
            *median
        } else {
            let median = route_median(&state.db, &origin, &destination).await?;
            medians.insert(route, median);
            median
        };
        fares.push(FareView {
            origin,
            destination,
            carrier,
            departure,
            price_kes,
            median_60d_kes: median,
            below_median: median.is_some_and(|value| price_kes < value),
        });
    }
    Ok(Json(fares))
}

async fn subscribe(
    State(state): State<AppState>,
    Json(subscription): Json<SubscriptionRequest>,
) -> Result<StatusCode, ApiError> {
    if !subscription.endpoint.starts_with("https://")
        || subscription.keys.p256dh.is_empty()
        || subscription.keys.auth.is_empty()
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            anyhow::anyhow!("invalid push subscription"),
        ));
    }
    sqlx::query(
        "INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?1, ?2, ?3)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth",
    )
    .bind(subscription.endpoint)
    .bind(subscription.keys.p256dh)
    .bind(subscription.keys.auth)
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn unsubscribe(
    State(state): State<AppState>,
    Json(request): Json<UnsubscribeRequest>,
) -> Result<StatusCode, ApiError> {
    sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = ?1")
        .bind(request.endpoint)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn vapid_public_key() -> Result<String, StatusCode> {
    env::var("VAPID_PUBLIC_KEY").map_err(|_| StatusCode::NOT_FOUND)
}

async fn collector_loop(state: AppState) {
    let hours = env::var("COLLECT_INTERVAL_HOURS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(6);
    let mut ticker = time::interval(Duration::from_secs(hours * 3600));
    loop {
        ticker.tick().await;
        if let Err(error) = collect_feeds(&state).await {
            eprintln!("collector run failed: {error:#}");
        }
    }
}

async fn collect_feeds(state: &AppState) -> Result<()> {
    let feed_urls = env::var("FEED_URLS").unwrap_or_default();
    for url in feed_urls.split(',').map(str::trim).filter(|url| !url.is_empty()) {
        let feed_result = state
            .http
            .get(url)
            .send()
            .await
            .with_context(|| format!("could not fetch feed {url}"))
            .and_then(|response| {
                response
                    .error_for_status()
                    .with_context(|| format!("feed returned an unsuccessful status: {url}"))
            });
        let feed = match feed_result {
            Ok(response) => match response.json::<Feed>().await {
                Ok(feed) => feed,
                Err(error) => {
                    eprintln!("feed did not match the JSON contract ({url}): {error}");
                    continue;
                }
            },
            Err(error) => {
                eprintln!("could not load feed ({url}): {error:#}");
                continue;
            }
        };

        for fare in feed.fares {
            if !valid_fare(&fare) {
                eprintln!("skipping invalid fare from {url}");
                continue;
            }
            let origin = fare.origin.to_ascii_uppercase();
            let destination = fare.destination.to_ascii_uppercase();
            let baseline = route_median(&state.db, &origin, &destination).await?;
            let result = sqlx::query(
                "INSERT OR IGNORE INTO fares
                 (origin, destination, carrier, departure, price_kes, source, collected_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(&origin)
            .bind(&destination)
            .bind(fare.carrier.trim())
            .bind(fare.departure.to_rfc3339())
            .bind(fare.price_kes)
            .bind(url)
            .bind(Utc::now().to_rfc3339())
            .execute(&state.db)
            .await?;
            if result.rows_affected() > 0 && baseline.is_some_and(|median| fare.price_kes < median) {
                notify_deal(state, &fare, baseline.unwrap_or_default()).await;
            }
        }
    }
    Ok(())
}

async fn route_median(db: &SqlitePool, origin: &str, destination: &str) -> Result<Option<i64>> {
    let prices = sqlx::query_scalar::<_, i64>(
        "SELECT price_kes FROM fares WHERE origin = ?1 AND destination = ?2
         AND julianday(collected_at) >= julianday('now', '-60 days') ORDER BY price_kes",
    )
    .bind(origin.to_ascii_uppercase())
    .bind(destination.to_ascii_uppercase())
    .fetch_all(db)
    .await?;
    Ok(median(prices))
}

async fn notify_deal(state: &AppState, fare: &IncomingFare, median: i64) {
    let Some(push) = &state.push else { return };
    let subscriptions = sqlx::query_as::<_, (String, String, String)>(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions",
    )
    .fetch_all(&state.db)
    .await;
    let subscriptions = match subscriptions {
        Ok(subscriptions) => subscriptions,
        Err(error) => {
            eprintln!("could not load push subscriptions: {error}");
            return;
        }
    };
    let payload = serde_json::json!({
        "title": format!("Fare deal: {} to {}", fare.origin, fare.destination),
        "body": format!("{}: KES {} (60-day median KES {})", fare.carrier, fare.price_kes, median),
        "url": "/"
    })
    .to_string();

    for (endpoint, p256dh, auth) in subscriptions {
        let subscription = SubscriptionInfo::new(endpoint, p256dh, auth);
        let result = async {
            let mut signature = VapidSignatureBuilder::from_pem(
                File::open(&push.private_key_file)?,
                &subscription,
            )?;
            signature.add_claim("sub", &push.subject);
            let mut message = WebPushMessageBuilder::new(&subscription);
            message.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
            message.set_vapid_signature(signature.build()?);
            push.client.send(message.build()?).await?;
            anyhow::Ok(())
        }
        .await;
        if let Err(error) = result {
            eprintln!("could not send a push notification: {error:#}");
        }
    }
}

fn validate_airport(code: &str) -> Result<(), ApiError> {
    if AIRPORTS.contains(&code.to_ascii_uppercase().as_str()) {
        Ok(())
    } else {
        Err(ApiError(
            StatusCode::BAD_REQUEST,
            anyhow::anyhow!("unsupported airport code"),
        ))
    }
}

fn valid_fare(fare: &IncomingFare) -> bool {
    AIRPORTS.contains(&fare.origin.to_ascii_uppercase().as_str())
        && AIRPORTS.contains(&fare.destination.to_ascii_uppercase().as_str())
        && fare.origin.to_ascii_uppercase() != fare.destination.to_ascii_uppercase()
        && !fare.carrier.trim().is_empty()
        && fare.price_kes > 0
}

fn median(mut values: Vec<i64>) -> Option<i64> {
    if values.is_empty() {
        return None;
    }
    values.sort_unstable();
    let middle = values.len() / 2;
    Some(if values.len() % 2 == 0 {
        values[middle - 1] + (values[middle] - values[middle - 1]) / 2
    } else {
        values[middle]
    })
}

#[cfg(test)]
mod tests {
    use super::{median, valid_fare, IncomingFare};
    use chrono::Utc;

    #[test]
    fn median_handles_even_odd_and_empty_samples() {
        assert_eq!(median(vec![]), None);
        assert_eq!(median(vec![9, 1, 5]), Some(5));
        assert_eq!(median(vec![8, 2, 4, 6]), Some(5));
    }

    #[test]
    fn fare_validation_rejects_unknown_routes_and_nonpositive_prices() {
        let fare = |origin: &str, destination: &str, price_kes| IncomingFare {
            origin: origin.to_owned(),
            destination: destination.to_owned(),
            carrier: "Carrier".to_owned(),
            departure: Utc::now(),
            price_kes,
        };
        assert!(valid_fare(&fare("NBO", "MBA", 1000)));
        assert!(!valid_fare(&fare("NBO", "XYZ", 1000)));
        assert!(!valid_fare(&fare("NBO", "MBA", 0)));
    }
}
