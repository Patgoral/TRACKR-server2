const mongoose = require('mongoose')
const Schema = mongoose.Schema


const attendeeSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
		},
		date: {
			type: Date,
		},
		image: { 
            type: String ,
        },
        gpx: {
            type: Object,
        },

		// owner: {
		// 	type: mongoose.Schema.Types.ObjectId,
		// 	ref: 'User',
		// },
	},
	{
		timestamps: true,
	}
)


module.exports = mongoose.model('Attendee', attendeeSchema)
