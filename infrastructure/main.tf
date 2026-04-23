terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = "us-east-1"
  profile = "cricket-zone"
}

variable "google_client_id" {
  description = "Google OAuth 2.0 client ID"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 client secret"
  type        = string
  sensitive   = true
}

# S3 bucket for the game files
resource "aws_s3_bucket" "frontend" {
  bucket = "cricket-zone-frontend-hussain"
}

# Block all public access (CloudFront will access it privately)
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Allow CloudFront to access the private S3 bucket
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "cricket-zone-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = ["playhowzat.com", "www.playhowzat.com"]
  comment             = "Cricket Zone"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-cricket-zone"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Videos (bowling + batting) — 30-day default, 1-year max.
  # Videos are immutable in practice; CI sets max-age=31536000 on batting.
  # This behaviour is a belt-and-suspenders guarantee for manually-uploaded
  # bowling files that may have been pushed without a Cache-Control header.
  ordered_cache_behavior {
    path_pattern           = "/content/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-cricket-zone"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 2592000  # 30 days — used when S3 sends no Cache-Control header
    max_ttl     = 31536000 # 1 year  — caps what S3 Cache-Control can request
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-cricket-zone"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    # Without explicit TTL values the Terraform AWS provider defaults all three
    # to 0, which disables CloudFront caching entirely (every request hits S3).
    # With min=0/default=86400/max=31536000, CloudFront honours S3 Cache-Control
    # headers (no-cache for index.html; max-age for assets) and falls back to
    # 1 day for any object uploaded without a Cache-Control header.
    min_ttl     = 0
    default_ttl = 86400    # 1 day fallback when S3 sends no Cache-Control header
    max_ttl     = 31536000 # 1 year max — lets S3 headers be fully honoured
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = "arn:aws:acm:us-east-1:989126024881:certificate/0941e31d-10f1-477e-970c-08dabed577ab"
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# S3 bucket policy — only allow CloudFront to read files
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# Allow browser PUT requests for avatar uploads (presigned URL flow)
resource "aws_s3_bucket_cors_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["https://playhowzat.com"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

# Output the CloudFront URL when apply completes
output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

# ─────────────────────────────────────────
# DynamoDB Tables
# ─────────────────────────────────────────

resource "aws_dynamodb_table" "scores" {
  name         = "cricket-zone-scores"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "scoreId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "scoreId"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    name            = "category-date-index"
    hash_key        = "category"
    range_key       = "date"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_dynamodb_table" "content" {
  name         = "cricket-zone-content"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "category"
  range_key    = "itemId"

  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "itemId"
    type = "S"
  }

  tags = {
    Project = "cricket-zone"
  }
}




# ─────────────────────────────────────────
# IAM Role for Lambda Functions
# ─────────────────────────────────────────

resource "aws_iam_role" "lambda_exec" {
  name = "cricket-zone-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "cricket-zone-lambda-dynamodb"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:BatchGetItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.scores.arn,
          "${aws_dynamodb_table.scores.arn}/index/*",
          aws_dynamodb_table.content.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_cognito" {
  name = "cricket-zone-lambda-cognito"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminDeleteUser"]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_s3_avatars" {
  name = "cricket-zone-lambda-s3-avatars"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.frontend.arn}/avatars/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}



# ─────────────────────────────────────────
# Lambda Functions
# ─────────────────────────────────────────

data "archive_file" "daily_challenge" {
  type        = "zip"
  source_dir  = "../backend/functions/daily-challenge"
  output_path = "../backend/functions/daily-challenge.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "save_score" {
  type        = "zip"
  source_dir  = "../backend/functions/save-score"
  output_path = "../backend/functions/save-score.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "leaderboard" {
  type        = "zip"
  source_dir  = "../backend/functions/leaderboard"
  output_path = "../backend/functions/leaderboard.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "delete_account" {
  type        = "zip"
  source_dir  = "../backend/functions/delete-account"
  output_path = "../backend/functions/delete-account.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "avatar_upload" {
  type        = "zip"
  source_dir  = "../backend/functions/avatar-upload"
  output_path = "../backend/functions/avatar-upload.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "played_today" {
  type        = "zip"
  source_dir  = "../backend/functions/played-today"
  output_path = "../backend/functions/played-today.zip"
}

data "archive_file" "rename_user" {
  type        = "zip"
  source_dir  = "../backend/functions/rename-user"
  output_path = "../backend/functions/rename-user.zip"
  excludes    = ["node_modules/.cache"]
}

resource "aws_lambda_function" "daily_challenge" {
  filename         = data.archive_file.daily_challenge.output_path
  function_name    = "cricket-zone-daily-challenge"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.daily_challenge.output_base64sha256

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "save_score" {
  filename         = data.archive_file.save_score.output_path
  function_name    = "cricket-zone-save-score"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.save_score.output_base64sha256

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "leaderboard" {
  filename         = data.archive_file.leaderboard.output_path
  function_name    = "cricket-zone-leaderboard"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.leaderboard.output_base64sha256

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "delete_account" {
  filename         = data.archive_file.delete_account.output_path
  function_name    = "cricket-zone-delete-account"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.delete_account.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    }
  }

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "played_today" {
  filename         = data.archive_file.played_today.output_path
  function_name    = "cricket-zone-played-today"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.played_today.output_base64sha256

  environment {
    variables = {
      SCORES_TABLE = "cricket-zone-scores"
    }
  }

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "rename_user" {
  filename         = data.archive_file.rename_user.output_path
  function_name    = "cricket-zone-rename-user"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.rename_user.output_base64sha256

  environment {
    variables = {
      SCORES_TABLE = "cricket-zone-scores"
    }
  }

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_lambda_function" "avatar_upload" {
  filename         = data.archive_file.avatar_upload.output_path
  function_name    = "cricket-zone-avatar-upload"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.avatar_upload.output_base64sha256

  environment {
    variables = {
      AVATAR_BUCKET = aws_s3_bucket.frontend.bucket
    }
  }

  tags = {
    Project = "cricket-zone"
  }
}



# ─────────────────────────────────────────
# API Gateway
# ─────────────────────────────────────────

resource "aws_apigatewayv2_api" "main" {
  name          = "cricket-zone-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://playhowzat.com"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}

resource "aws_apigatewayv2_integration" "daily_challenge" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.daily_challenge.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "save_score" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.save_score.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "leaderboard" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.leaderboard.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "daily_challenge" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /daily"
  target    = "integrations/${aws_apigatewayv2_integration.daily_challenge.id}"
}

resource "aws_apigatewayv2_route" "save_score" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /score"
  target    = "integrations/${aws_apigatewayv2_integration.save_score.id}"
}

resource "aws_apigatewayv2_route" "leaderboard" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /leaderboard"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard.id}"
}

resource "aws_apigatewayv2_integration" "delete_account" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.delete_account.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "avatar_upload" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.avatar_upload.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "delete_account" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /account"
  target    = "integrations/${aws_apigatewayv2_integration.delete_account.id}"
}

resource "aws_apigatewayv2_route" "avatar_upload" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /avatar/upload-url"
  target    = "integrations/${aws_apigatewayv2_integration.avatar_upload.id}"
}

resource "aws_apigatewayv2_integration" "played_today" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.played_today.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "played_today" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /played-today"
  target    = "integrations/${aws_apigatewayv2_integration.played_today.id}"
}

resource "aws_apigatewayv2_integration" "rename_user" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.rename_user.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "rename_user" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /rename"
  target    = "integrations/${aws_apigatewayv2_integration.rename_user.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # Stage-wide ceiling — protects all routes from general abuse.
  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 200
  }

  # POST /score is the most expensive route: every call triggers a DynamoDB
  # GetItem + 2x PutItem on a PAY_PER_REQUEST table. A tighter limit here
  # caps worst-case write costs without affecting any real player.
  # 20 req/s sustained is ~1.7 M requests/day — far beyond realistic traffic.
  # Burst of 50 handles 50 players finishing a game at the same second.
  route_settings {
    route_key              = "POST /score"
    throttling_rate_limit  = 20
    throttling_burst_limit = 50
  }
}

resource "aws_lambda_permission" "daily_challenge" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_challenge.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "save_score" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_score.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "leaderboard" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.leaderboard.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_account" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_account.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "avatar_upload" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.avatar_upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "played_today" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.played_today.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "rename_user" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rename_user.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}



# ─────────────────────────────────────────
# Cognito User Pool
# ─────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  name = "cricket-zone-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Project = "cricket-zone"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "howzat"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "email openid profile"
  }

  attribute_mapping = {
    username = "sub"
    email    = "email"
    name     = "name"
    picture  = "picture"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "cricket-zone-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  supported_identity_providers = ["COGNITO", "Google"]

  callback_urls = [
    "https://playhowzat.com",
    "https://playhowzat.com/",
    "https://www.playhowzat.com",
    "https://www.playhowzat.com/"
  ]
  logout_urls = [
    "https://playhowzat.com",
    "https://playhowzat.com/",
    "https://www.playhowzat.com",
    "https://www.playhowzat.com/"
  ]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  read_attributes = ["email", "name", "picture"]

  depends_on = [aws_cognito_identity_provider.google]
}

# ─────────────────────────────────────────
# API Gateway JWT Authorizer
# ─────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# ─────────────────────────────────────────
# Cognito Outputs
# ─────────────────────────────────────────

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.main.id
  description = "Cognito User Pool ID — needed by the frontend SDK"
}

output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.web.id
  description = "Cognito App Client ID — needed by the frontend SDK"
}

output "cognito_domain" {
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.us-east-1.amazoncognito.com"
  description = "Cognito hosted domain — used as the OAuth2 base URL for Google sign-in"
}

# ─────────────────────────────────────────
# Monitoring — SNS topic + CloudWatch alarms
# ─────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "cricket-zone-alerts"
}

# Email delivery for all alarms. Terraform creates the subscription but AWS
# sends a confirmation email — the subscription stays pending until confirmed.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "nain.ashee@gmail.com"
}

# Lambda error alarms — one per deployed function.
# Fires as soon as any error is recorded in a 5-minute window.
locals {
  lambda_function_names = [
    aws_lambda_function.daily_challenge.function_name,
    aws_lambda_function.save_score.function_name,
    aws_lambda_function.leaderboard.function_name,
    aws_lambda_function.played_today.function_name,
    aws_lambda_function.avatar_upload.function_name,
    aws_lambda_function.delete_account.function_name,
    aws_lambda_function.rename_user.function_name,
  ]
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(local.lambda_function_names)

  alarm_name          = "${each.key}-errors"
  alarm_description   = "One or more errors recorded for Lambda function ${each.key}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# API Gateway 5xx — server-side errors (Lambda crashes, timeouts, misconfig).
# Threshold: >5 errors in 5 minutes avoids noise from isolated retries.
resource "aws_cloudwatch_metric_alarm" "apigw_5xx" {
  alarm_name          = "cricket-zone-apigw-5xx"
  alarm_description   = "API Gateway 5XX errors exceeded 5 in 5 minutes"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5XXError"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id, Stage = "$default" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# API Gateway 4xx — elevated rate can signal a broken client or abuse burst.
# Threshold: >50 in 5 minutes (some 4xx from validation failures is normal).
resource "aws_cloudwatch_metric_alarm" "apigw_4xx" {
  alarm_name          = "cricket-zone-apigw-4xx"
  alarm_description   = "API Gateway 4XX errors exceeded 50 in 5 minutes"
  namespace           = "AWS/ApiGateway"
  metric_name         = "4XXError"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id, Stage = "$default" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# CloudFront 5xx error rate — S3 or origin unreachable.
# Threshold: >5% of requests returning 5xx over 5 minutes.
resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  alarm_name          = "cricket-zone-cloudfront-5xx"
  alarm_description   = "CloudFront 5xx error rate exceeded 5%"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.frontend.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ─────────────────────────────────────────
# CloudWatch Dashboard
# ─────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "cricket-zone"

  dashboard_body = jsonencode({
    widgets = [

      # ── Row 1 (y=0, h=3): Health Snapshot ─────────────────────────────
      # Single alarm-status panel — all 10 alarms visible at once.
      # Green/red at a glance; no need to drill into individual graphs
      # to know if something is broken.
      {
        type   = "alarm"
        x      = 0
        y      = 0
        width  = 24
        height = 3
        properties = {
          title  = "🏏 System Health — All Alarms"
          alarms = concat(
            values(aws_cloudwatch_metric_alarm.lambda_errors)[*].arn,
            [
              aws_cloudwatch_metric_alarm.apigw_4xx.arn,
              aws_cloudwatch_metric_alarm.apigw_5xx.arn,
              aws_cloudwatch_metric_alarm.cloudfront_5xx.arn,
            ]
          )
        }
      },

      # ── Row 2 (y=3, h=6): Lambda ──────────────────────────────────────
      # Left: error sum — tells you which function is failing.
      # Right: p95 duration — catches slow cold starts or DynamoDB timeouts.
      {
        type   = "metric"
        x      = 0
        y      = 3
        width  = 12
        height = 6
        properties = {
          title   = "Lambda — Errors (all functions)"
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          period  = 300
          stat    = "Sum"
          metrics = [for fn in local.lambda_function_names :
            ["AWS/Lambda", "Errors", "FunctionName", fn]
          ]
          annotations = { horizontal = [] }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 3
        width  = 12
        height = 6
        properties = {
          title   = "Lambda — Duration p95 (ms)"
          view    = "timeSeries"
          stacked = false
          region  = "us-east-1"
          period  = 300
          stat    = "p95"
          metrics = [for fn in local.lambda_function_names :
            ["AWS/Lambda", "Duration", "FunctionName", fn]
          ]
          annotations = { horizontal = [] }
        }
      },

      # ── Row 3 (y=9, h=6): API Gateway ─────────────────────────────────
      # Threshold annotations mirror alarm settings so the graph makes
      # the alarm boundary visible without duplicating alert logic.
      {
        type   = "metric"
        x      = 0
        y      = 9
        width  = 8
        height = 6
        properties = {
          title   = "API Gateway — 4xx Errors (alarm >50 / 5 min)"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "Sum"
          metrics = [
            ["AWS/ApiGateway", "4XXError",
             "ApiId", aws_apigatewayv2_api.main.id,
             "Stage", "$default"]
          ]
          annotations = {
            horizontal = [{ value = 50, label = "Alarm threshold", color = "#ff6961" }]
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 9
        width  = 8
        height = 6
        properties = {
          title   = "API Gateway — 5xx Errors (alarm >5 / 5 min)"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "Sum"
          metrics = [
            ["AWS/ApiGateway", "5XXError",
             "ApiId", aws_apigatewayv2_api.main.id,
             "Stage", "$default"]
          ]
          annotations = {
            horizontal = [{ value = 5, label = "Alarm threshold", color = "#ff6961" }]
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 9
        width  = 8
        height = 6
        properties = {
          title   = "API Gateway — Latency p95 (ms)"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "p95"
          metrics = [
            ["AWS/ApiGateway", "Latency",
             "ApiId", aws_apigatewayv2_api.main.id,
             "Stage", "$default"]
          ]
          annotations = { horizontal = [] }
        }
      },

      # ── Row 4 (y=15, h=6): CloudFront ─────────────────────────────────
      # Error rate and cache hit rate together validate that the caching
      # work (TTL changes, ordered behaviors) is actually taking effect.
      # Requests gives traffic baseline for interpreting the other two.
      {
        type   = "metric"
        x      = 0
        y      = 15
        width  = 8
        height = 6
        properties = {
          title   = "CloudFront — 5xx Error Rate % (alarm >5%)"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "Average"
          metrics = [
            ["AWS/CloudFront", "5xxErrorRate",
             "DistributionId", aws_cloudfront_distribution.frontend.id,
             "Region", "Global"]
          ]
          annotations = {
            horizontal = [{ value = 5, label = "Alarm threshold", color = "#ff6961" }]
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 15
        width  = 8
        height = 6
        properties = {
          title   = "CloudFront — Cache Hit Rate %"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "Average"
          metrics = [
            ["AWS/CloudFront", "CacheHitRate",
             "DistributionId", aws_cloudfront_distribution.frontend.id,
             "Region", "Global"]
          ]
          annotations = { horizontal = [] }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 15
        width  = 8
        height = 6
        properties = {
          title   = "CloudFront — Requests"
          view    = "timeSeries"
          region  = "us-east-1"
          period  = 300
          stat    = "Sum"
          metrics = [
            ["AWS/CloudFront", "Requests",
             "DistributionId", aws_cloudfront_distribution.frontend.id,
             "Region", "Global"]
          ]
          annotations = { horizontal = [] }
        }
      },

    ]
  })
}