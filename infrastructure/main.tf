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

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
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