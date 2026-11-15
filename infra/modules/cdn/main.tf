# The front door (ADR 0017): one CloudFront distribution. `/api/*` goes to the API's function URL,
# `/audio/*` to the audio bucket, everything else to the web app. CloudFront signs every origin
# request, so the buckets and the function URL answer this distribution only.
variable "name" {
  type = string
}

variable "web_bucket" {
  type = object({ id = string, arn = string, bucket_regional_domain_name = string })
}

variable "audio_bucket" {
  type = object({ id = string, arn = string, bucket_regional_domain_name = string })
}

variable "api_function_name" {
  type = string
}

variable "api_function_url" {
  type = string
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Every viewer header but Host: the function URL must see its own host to accept the signature.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.name}-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# A request with a body also needs that body's SHA-256 from the browser (apps/web/src/body-hash.ts).
resource "aws_cloudfront_origin_access_control" "api" {
  name                              = "${var.name}-api"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The API's rate limits key on the viewer's IP, written here over anything the viewer sent
# (apps/api/src/cloudfront.ts).
resource "aws_cloudfront_function" "viewer_ip" {
  name    = "${var.name}-viewer-ip"
  runtime = "cloudfront-js-2.0"
  code    = <<-JS
    function handler(event) {
      event.request.headers["x-viewer-ip"] = { value: event.viewer.ip };
      return event.request;
    }
  JS
}

# The web app routes in the browser: a path without a file extension gets index.html. This runs on
# the web behavior only, so the API's own 404s stay 404s.
resource "aws_cloudfront_function" "spa" {
  name    = "${var.name}-spa"
  runtime = "cloudfront-js-2.0"
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (!/\.[a-z0-9]+$/i.test(request.uri)) request.uri = "/index.html";
      return request;
    }
  JS
}

locals {
  api_domain = split("/", var.api_function_url)[2]
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = var.name
  default_root_object = "index.html"
  http_version        = "http2and3"
  # North America and Europe only: the cheapest edge locations.
  price_class = "PriceClass_100"

  origin {
    origin_id                = "web"
    domain_name              = var.web_bucket.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "audio"
    domain_name              = var.audio_bucket.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "api"
    domain_name              = local.api_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.api.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # Aurora's resume takes about 15 s (ADR 0015).
      origin_read_timeout = 30
    }
  }

  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_ip.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/audio/*"
    target_origin_id       = "audio"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "from_cdn" {
  for_each = { web = var.web_bucket, audio = var.audio_bucket }
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${each.value.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
    }]
  })
}

# Lambda wants both grants for an IAM-authorized function URL.
resource "aws_lambda_permission" "url_from_cdn" {
  statement_id           = "FunctionUrlFromCloudFront"
  function_name          = var.api_function_name
  action                 = "lambda:InvokeFunctionUrl"
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.this.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "invoke_from_cdn" {
  statement_id             = "InvokeFromCloudFront"
  function_name            = var.api_function_name
  action                   = "lambda:InvokeFunction"
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.this.arn
  invoked_via_function_url = true
}

output "url" {
  value = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}
