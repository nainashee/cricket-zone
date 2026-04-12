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

# ─────────────────────────────────────────
# DynamoDB Tables (dev)
# ─────────────────────────────────────────

resource "aws_dynamodb_table" "scores_dev" {
  name         = "cricket-zone-scores-dev"
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
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_dynamodb_table" "content_dev" {
  name         = "cricket-zone-content-dev"
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
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

# ─────────────────────────────────────────
# IAM Role for Lambda Functions (dev)
# ─────────────────────────────────────────

resource "aws_iam_role" "lambda_exec_dev" {
  name = "cricket-zone-lambda-role-dev"

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
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb_dev" {
  name = "cricket-zone-lambda-dynamodb-dev"
  role = aws_iam_role.lambda_exec_dev.id

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
          aws_dynamodb_table.scores_dev.arn,
          "${aws_dynamodb_table.scores_dev.arn}/index/*",
          aws_dynamodb_table.content_dev.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_cognito_dev" {
  name = "cricket-zone-lambda-cognito-dev"
  role = aws_iam_role.lambda_exec_dev.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminDeleteUser"]
        Resource = aws_cognito_user_pool.dev.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_s3_avatars_dev" {
  name = "cricket-zone-lambda-s3-avatars-dev"
  role = aws_iam_role.lambda_exec_dev.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.frontend_dev.arn}/avatars/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs_dev" {
  role       = aws_iam_role.lambda_exec_dev.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─────────────────────────────────────────
# Lambda Functions (dev)
# ─────────────────────────────────────────

data "archive_file" "daily_challenge_dev" {
  type        = "zip"
  source_dir  = "../../backend/functions/daily-challenge"
  output_path = "../../backend/functions/daily-challenge-dev.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "save_score_dev" {
  type        = "zip"
  source_dir  = "../../backend/functions/save-score"
  output_path = "../../backend/functions/save-score-dev.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "leaderboard_dev" {
  type        = "zip"
  source_dir  = "../../backend/functions/leaderboard"
  output_path = "../../backend/functions/leaderboard-dev.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "delete_account_dev" {
  type        = "zip"
  source_dir  = "../../backend/functions/delete-account"
  output_path = "../../backend/functions/delete-account-dev.zip"
  excludes    = ["node_modules/.cache"]
}

data "archive_file" "avatar_upload_dev" {
  type        = "zip"
  source_dir  = "../../backend/functions/avatar-upload"
  output_path = "../../backend/functions/avatar-upload-dev.zip"
  excludes    = ["node_modules/.cache"]
}

resource "aws_lambda_function" "daily_challenge_dev" {
  filename         = data.archive_file.daily_challenge_dev.output_path
  function_name    = "cricket-zone-daily-challenge-dev"
  role             = aws_iam_role.lambda_exec_dev.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.daily_challenge_dev.output_base64sha256

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_lambda_function" "save_score_dev" {
  filename         = data.archive_file.save_score_dev.output_path
  function_name    = "cricket-zone-save-score-dev"
  role             = aws_iam_role.lambda_exec_dev.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.save_score_dev.output_base64sha256

  environment {
    variables = {
      SCORES_TABLE = "cricket-zone-scores-dev"
    }
  }

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_lambda_function" "leaderboard_dev" {
  filename         = data.archive_file.leaderboard_dev.output_path
  function_name    = "cricket-zone-leaderboard-dev"
  role             = aws_iam_role.lambda_exec_dev.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.leaderboard_dev.output_base64sha256

  environment {
    variables = {
      SCORES_TABLE = "cricket-zone-scores-dev"
    }
  }

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_lambda_function" "delete_account_dev" {
  filename         = data.archive_file.delete_account_dev.output_path
  function_name    = "cricket-zone-delete-account-dev"
  role             = aws_iam_role.lambda_exec_dev.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.delete_account_dev.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.dev.id
      SCORES_TABLE         = "cricket-zone-scores-dev"
    }
  }

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_lambda_function" "avatar_upload_dev" {
  filename         = data.archive_file.avatar_upload_dev.output_path
  function_name    = "cricket-zone-avatar-upload-dev"
  role             = aws_iam_role.lambda_exec_dev.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.avatar_upload_dev.output_base64sha256

  environment {
    variables = {
      AVATAR_BUCKET = aws_s3_bucket.frontend_dev.bucket
    }
  }

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

# ─────────────────────────────────────────
# API Gateway (dev)
# ─────────────────────────────────────────

resource "aws_apigatewayv2_api" "dev" {
  name          = "cricket-zone-api-dev"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}

resource "aws_apigatewayv2_integration" "daily_challenge_dev" {
  api_id                 = aws_apigatewayv2_api.dev.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.daily_challenge_dev.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "save_score_dev" {
  api_id                 = aws_apigatewayv2_api.dev.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.save_score_dev.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "leaderboard_dev" {
  api_id                 = aws_apigatewayv2_api.dev.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.leaderboard_dev.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "daily_challenge_dev" {
  api_id    = aws_apigatewayv2_api.dev.id
  route_key = "GET /daily"
  target    = "integrations/${aws_apigatewayv2_integration.daily_challenge_dev.id}"
}

resource "aws_apigatewayv2_route" "save_score_dev" {
  api_id    = aws_apigatewayv2_api.dev.id
  route_key = "POST /score"
  target    = "integrations/${aws_apigatewayv2_integration.save_score_dev.id}"
}

resource "aws_apigatewayv2_route" "leaderboard_dev" {
  api_id    = aws_apigatewayv2_api.dev.id
  route_key = "GET /leaderboard"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard_dev.id}"
}

resource "aws_apigatewayv2_integration" "delete_account_dev" {
  api_id                 = aws_apigatewayv2_api.dev.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.delete_account_dev.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "avatar_upload_dev" {
  api_id                 = aws_apigatewayv2_api.dev.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.avatar_upload_dev.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "delete_account_dev" {
  api_id    = aws_apigatewayv2_api.dev.id
  route_key = "DELETE /account"
  target    = "integrations/${aws_apigatewayv2_integration.delete_account_dev.id}"
}

resource "aws_apigatewayv2_route" "avatar_upload_dev" {
  api_id    = aws_apigatewayv2_api.dev.id
  route_key = "GET /avatar/upload-url"
  target    = "integrations/${aws_apigatewayv2_integration.avatar_upload_dev.id}"
}

resource "aws_apigatewayv2_stage" "default_dev" {
  api_id      = aws_apigatewayv2_api.dev.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "daily_challenge_dev" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_challenge_dev.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.dev.execution_arn}/*/*"
}

resource "aws_lambda_permission" "save_score_dev" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_score_dev.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.dev.execution_arn}/*/*"
}

resource "aws_lambda_permission" "leaderboard_dev" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.leaderboard_dev.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.dev.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_account_dev" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_account_dev.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.dev.execution_arn}/*/*"
}

resource "aws_lambda_permission" "avatar_upload_dev" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.avatar_upload_dev.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.dev.execution_arn}/*/*"
}

# ─────────────────────────────────────────
# S3 Bucket for Frontend (dev)
# ─────────────────────────────────────────

resource "aws_s3_bucket" "frontend_dev" {
  bucket = "cricket-zone-frontend-hussain-dev"

  tags = {
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend_dev" {
  bucket = aws_s3_bucket.frontend_dev.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "frontend_dev" {
  bucket = aws_s3_bucket.frontend_dev.id

  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_cors_configuration" "frontend_dev" {
  bucket = aws_s3_bucket.frontend_dev.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "frontend_dev" {
  bucket     = aws_s3_bucket.frontend_dev.id
  depends_on = [aws_s3_bucket_public_access_block.frontend_dev]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend_dev.arn}/*"
      }
    ]
  })
}

# ─────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────

output "dev_api_url" {
  value       = aws_apigatewayv2_stage.default_dev.invoke_url
  description = "Dev API Gateway URL — add this as DEV_API_URL in GitHub secrets"
}

output "dev_frontend_url" {
  value       = "http://${aws_s3_bucket_website_configuration.frontend_dev.website_endpoint}"
  description = "Dev frontend URL (S3 static website)"
}



# ─────────────────────────────────────────
# Cognito User Pool (dev)
# ─────────────────────────────────────────

resource "aws_cognito_user_pool" "dev" {
  name = "cricket-zone-users-dev"

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
    Project     = "cricket-zone"
    Environment = "dev"
  }
}

resource "aws_cognito_user_pool_domain" "dev" {
  domain       = "howzat-dev"
  user_pool_id = aws_cognito_user_pool.dev.id
}

resource "aws_cognito_identity_provider" "google_dev" {
  user_pool_id  = aws_cognito_user_pool.dev.id
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
  }
}

resource "aws_cognito_user_pool_client" "web_dev" {
  name         = "cricket-zone-web-client-dev"
  user_pool_id = aws_cognito_user_pool.dev.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  supported_identity_providers = ["COGNITO", "Google"]

  callback_urls = ["http://localhost", "http://localhost:3000", "http://localhost:8080"]
  logout_urls   = ["http://localhost", "http://localhost:3000", "http://localhost:8080"]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  depends_on = [aws_cognito_identity_provider.google_dev]
}

# ─────────────────────────────────────────
# API Gateway JWT Authorizer (dev)
# ─────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito_dev" {
  api_id           = aws_apigatewayv2_api.dev.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer-dev"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web_dev.id]
    issuer   = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.dev.id}"
  }
}

# ─────────────────────────────────────────
# Cognito Outputs (dev)
# ─────────────────────────────────────────

output "cognito_user_pool_id_dev" {
  value       = aws_cognito_user_pool.dev.id
  description = "Dev Cognito User Pool ID"
}

output "cognito_client_id_dev" {
  value       = aws_cognito_user_pool_client.web_dev.id
  description = "Dev Cognito App Client ID"
}

output "cognito_domain_dev" {
  value       = "https://${aws_cognito_user_pool_domain.dev.domain}.auth.us-east-1.amazoncognito.com"
  description = "Dev Cognito hosted domain — used as the OAuth2 base URL for Google sign-in"
}
