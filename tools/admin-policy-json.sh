#!/usr/bin/env bash
cat <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSnapshotUploads",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::pumpstreams-snapshots-prod/*"
    },
    {
      "Sid": "AllowBucketList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::pumpstreams-snapshots-prod"
    }
  ]
}
POLICY
