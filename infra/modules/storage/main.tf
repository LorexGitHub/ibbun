# The buckets CloudFront serves (ADR 0017): the built web app and the generated audio. Both are
# private; the cdn module grants its distribution read access. The content bucket for the static
# export arrives with the export.
variable "name" {
  description = "Prefixes every bucket, e.g. `ibbun-showcase`."
  type        = string
}

data "aws_caller_identity" "current" {}

locals {
  # The web app is rebuilt on every deploy, so emptying its bucket loses nothing. Audio takes
  # VOICEVOX hours to generate, so its bucket refuses to be destroyed while it holds files.
  buckets = {
    web   = { force_destroy = true }
    audio = { force_destroy = false }
  }
}

# Bucket names are global, so the account id makes these unique.
resource "aws_s3_bucket" "this" {
  for_each      = local.buckets
  bucket        = "${var.name}-${each.key}-${data.aws_caller_identity.current.account_id}"
  force_destroy = each.value.force_destroy
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "web" {
  value = aws_s3_bucket.this["web"]
}

output "audio" {
  value = aws_s3_bucket.this["audio"]
}
