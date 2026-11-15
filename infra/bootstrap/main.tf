# The S3 bucket that holds every stage's Terraform state (ADR 0018). Applied once, by hand, before
# any stage's `terraform init`. Its own state stays local: if it is lost, `terraform import` the bucket.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "ibbun", ManagedBy = "terraform" }
  }
}

variable "region" {
  type    = string
  default = "eu-north-1"
}

data "aws_caller_identity" "current" {}

# Bucket names are global, so the account id makes this one unique.
resource "aws_s3_bucket" "state" {
  bucket = "ibbun-terraform-state-${data.aws_caller_identity.current.account_id}"
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning keeps every earlier state, so a bad apply can be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are kept 90 days, so the bucket does not grow without end.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-state"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

output "state_bucket" {
  description = "Goes in each stage's backend block as `bucket`."
  value       = aws_s3_bucket.state.bucket
}
