# The showcase stage (ADR 0017): the Learner side only. Its state lives in the bucket from
# `infra/bootstrap`, under its own key, locked with an S3 lock file.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket       = "ibbun-terraform-state-641127253699"
    key          = "showcase/terraform.tfstate"
    region       = "eu-north-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "ibbun", Stage = "showcase", ManagedBy = "terraform" }
  }
}

variable "region" {
  type    = string
  default = "eu-north-1"
}

module "database" {
  source = "../modules/database"
  name   = "ibbun-showcase"
}

module "storage" {
  source = "../modules/storage"
  name   = "ibbun-showcase"
}

module "api" {
  source               = "../modules/api"
  name                 = "ibbun-showcase"
  build_dir            = "${path.root}/../../apps/api/dist/lambda"
  ssm_path             = "/ibbun-showcase/app"
  database_url         = module.database.url
  database_connect_arn = module.database.connect_arn
}

module "cdn" {
  source            = "../modules/cdn"
  name              = "ibbun-showcase"
  web_bucket        = module.storage.web
  audio_bucket      = module.storage.audio
  api_function_name = module.api.function_name
  api_function_url  = module.api.function_url
}

# In SSM rather than the API's environment: the distribution needs the function URL first, and the
# API reads this at its next cold start.
resource "aws_ssm_parameter" "app_url" {
  name  = "/ibbun-showcase/app/APP_URL"
  type  = "String"
  value = module.cdn.url
}

output "url" {
  description = "The showcase's link."
  value       = module.cdn.url
}

output "distribution_id" {
  value = module.cdn.distribution_id
}

output "web_bucket" {
  value = module.storage.web.bucket
}

output "audio_bucket" {
  value = module.storage.audio.bucket
}

output "database_url" {
  value = module.database.url
}
