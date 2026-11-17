package blog

func creditPurchaseInput(input Row) Row {
	if amount, custom := input["amount"]; custom {
		if input["packId"] != nil {
			fail(400, "Choose a preset or a custom amount.")
		}
		return Row{"amount": amount}
	}
	return Row{"packId": stringField(input, "packId", 1, 64, false)}
}
