package blog

import "context"

func (a *App) commentPolicy(ctx context.Context) Row {
	policy := a.siteSetting(ctx, "comment-policy", Row{"requireEmailVerification": false, "requireApproval": true}, validCommentPolicy)
	policy["requireSignIn"] = true
	return policy
}
func validCommentPolicy(input Row) Row {
	strict(input, "requireEmailVerification", "requireApproval", "requireSignIn")
	return Row{"requireEmailVerification": booleanField(input, "requireEmailVerification"), "requireApproval": booleanField(input, "requireApproval")}
}
func (a *App) updatedCommentPolicy(ctx context.Context, input Row) Row {
	policy := a.commentPolicy(ctx)
	for _, key := range []string{"requireApproval", "requireEmailVerification"} {
		if _, ok := input[key]; ok {
			policy[key] = booleanField(input, key)
		}
	}
	if policy.yes("requireEmailVerification") && !a.commentPolicy(ctx).yes("requireEmailVerification") {
		a.ownerEmailDelivery(ctx)
	}
	return policy
}
