# The API (ADR 0015): Hono on Lambda, built by `pnpm stack:build:api`. Its function URL takes
# IAM-signed requests only, and the cdn module lets its distribution sign them. Secrets live in SSM
# under `ssm_path` and are read once per cold start.
terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
    random  = { source = "hashicorp/random", version = "~> 3.7" }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  ssm_arn = "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_path}"
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = var.build_dir
  output_path = "${path.root}/.build/api.zip"
  excludes    = ["**/*.map"]
}

# Write-only: the secret reaches SSM but never the state file. Bump `auth_secret_version` to rotate
# it, which signs every session out.
ephemeral "random_password" "auth_secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "auth_secret" {
  name             = "${var.ssm_path}/AUTH_SECRET"
  type             = "SecureString"
  value_wo         = ephemeral.random_password.auth_secret.result
  value_wo_version = var.auth_secret_version
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = 14
}

resource "aws_iam_role" "api" {
  name = "${var.name}-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.api.arn}:*" },
      { Effect = "Allow", Action = ["ssm:GetParametersByPath"], Resource = local.ssm_arn },
      {
        Effect    = "Allow"
        Action    = ["kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.${data.aws_region.current.region}.amazonaws.com" } }
      },
      { Effect = "Allow", Action = ["rds-db:connect"], Resource = var.database_connect_arn },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name}-api"
  role             = aws_iam_role.api.arn
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  handler          = "app/index.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = 512
  # A request after Aurora paused waits about 15 s for it to resume (ADR 0015).
  timeout = 30

  environment {
    variables = {
      NODE_ENV            = "production"
      SSM_PARAMETER_PATH  = var.ssm_path
      DATABASE_URL        = var.database_url
      DATABASE_POOL_MAX   = "2"
      DATABASE_IAM_REGION = data.aws_region.current.region
      MAIL_TRANSPORT      = "ses"
      MAIL_FROM           = "ibbun <no-reply@ibbun.example>"
      SHOWCASE            = "1"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.api.name
  }

  depends_on = [aws_iam_role_policy.api, aws_ssm_parameter.auth_secret]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}
