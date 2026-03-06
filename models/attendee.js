const mongoose = require('mongoose')
const Schema = mongoose.Schema


const attendeeSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
		},
		gender: {
			type: String,
			required: true,
		},
		geared: {
			type: String,
		},
		date: {
			type: Date,
		},
		finishTime: {
		type: Date,
		default: null,
		},
		finishDetected: {
			type: Boolean,
			default: false,
		},
		finishMatchMeta: {
			type: Object,
			default: null,
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
