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

output "database_url" {
  value = module.database.url
}
